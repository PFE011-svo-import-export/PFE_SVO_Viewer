/**
 * Service d'authentification.
 *
 * Seul endroit qui parle a l'AuthService et qui gere le token. Le viewer ne
 * decode JAMAIS le JWT : le backend renvoie deja le role dans la reponse de
 * /auth/login. Le token reste opaque (on le stocke et on le renverra plus tard
 * dans l'en-tete Authorization: Bearer).
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5294";

const TOKEN_KEY = "svo_token";
const ROLE_KEY = "svo_role";

/**
 * Emis quand un appel authentifie revient en 401 (token expire/invalide).
 * AuthProvider l'ecoute pour vider le role et declencher la redirection.
 */
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

/** Roles alignes sur l'AuthService. "" = non connecte (guest). */
export type UserRole = "" | "Admin" | "CAPD";

export interface LoginResult {
    ok: boolean;
    role: UserRole;
    /** Message a afficher quand ok === false. */
    error?: string;
}

/** Forme de la reponse renvoyee par POST /auth/login (cf. LoginResponse DTO). */
interface LoginResponse {
    token: string;
    expires: string;
    role: UserRole;
}

export async function login(email: string, password: string): Promise<LoginResult> {
    let response: Response;
    try {
        response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Email: email, Password: password }),
        });
    } catch {
        return { ok: false, role: "", error: "Impossible de joindre le serveur." };
    }

    if (response.status === 401) {
        return { ok: false, role: "", error: "Email ou mot de passe invalide." };
    }
    if (!response.ok) {
        return { ok: false, role: "", error: `Erreur serveur (${response.status}).` };
    }

    const data = (await response.json()) as Partial<LoginResponse>;
    if (!data.token) {
        return { ok: false, role: "", error: "Reponse invalide du serveur." };
    }

    saveSession(data.token, data.role ?? "");
    return { ok: true, role: data.role ?? "" };
}

export function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
}

/**
 * fetch authentifie : ajoute l'en-tete Authorization: Bearer <token> et
 * envoie/recoit du JSON. A utiliser pour tout appel vers un endpoint protege
 * (register, update, delete, futures APIs...).
 *
 * Si le serveur repond 401, la session est videe et un evenement global est
 * emis pour deconnecter l'utilisateur.
 */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });

    if (response.status === 401) {
        logout();
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }

    return response;
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

/** Role memorise localement, pour rester connecte apres un rafraichissement. */
export function getStoredRole(): UserRole {
    return (localStorage.getItem(ROLE_KEY) as UserRole | null) ?? "";
}

function saveSession(token: string, role: UserRole): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
}
