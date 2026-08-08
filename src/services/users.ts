/**
 * Service de gestion des comptes.
 *
 * Miroir du AuthController : toutes les routes passent par authFetch, donc le
 * token part dans l'en-tete et un 401 deconnecte l'utilisateur. Les garde-fous
 * de role vivent cote serveur ([Authorize(Roles = "Admin")]) ; l'interface ne
 * fait que masquer ce qui n'est pas permis.
 */

import { authFetch } from "./auth";
import type { UserRole } from "./auth";

/** Compte renvoye par l'API (cf. UserDto). Jamais de mot de passe en lecture. */
export interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
}

/** Saisie du formulaire de creation (cf. RegisterDto). */
export interface CreateUserInput {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRole;
}

/**
 * Saisie du formulaire de modification (cf. UpdateUserDto).
 * newPassword vide = mot de passe inchange.
 */
export interface UpdateUserInput {
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    newPassword?: string;
}

/** Erreur portant un message deja lisible par l'utilisateur. */
export class UserServiceError extends Error {}

/**
 * Traduit un corps d'erreur en une phrase affichable.
 *
 * Le controleur repond tantot une chaine ("Role invalide"), tantot la liste
 * d'IdentityError d'ASP.NET ({ code, description }), tantot { message }.
 */
async function readError(response: Response, fallback: string): Promise<string> {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return fallback;
    }

    if (typeof body === "string" && body.trim() !== "") return body;

    if (Array.isArray(body)) {
        const descriptions = body
            .map((e) => (typeof e === "string" ? e : (e as { description?: string })?.description))
            .filter((d): d is string => typeof d === "string" && d.trim() !== "");
        if (descriptions.length > 0) return descriptions.join(" ");
    }

    const message = (body as { message?: unknown })?.message;
    if (typeof message === "string" && message.trim() !== "") return message;

    return fallback;
}

async function request(path: string, options: RequestInit, fallback: string): Promise<void> {
    let response: Response;
    try {
        response = await authFetch(path, options);
    } catch {
        throw new UserServiceError("Impossible de joindre le serveur.");
    }

    if (!response.ok) {
        throw new UserServiceError(await readError(response, fallback));
    }
}

async function requestJson<T>(path: string, fallback: string): Promise<T> {
    let response: Response;
    try {
        response = await authFetch(path);
    } catch {
        throw new UserServiceError("Impossible de joindre le serveur.");
    }

    if (!response.ok) {
        throw new UserServiceError(await readError(response, fallback));
    }

    return (await response.json()) as T;
}

/** GET /auth/users — reserve aux administrateurs. */
export function getUsers(): Promise<User[]> {
    return requestJson<User[]>("/auth/users", "Impossible de charger les utilisateurs.");
}

/** GET /auth/me — compte de l'utilisateur connecte, quel que soit son role. */
export function getCurrentUser(): Promise<User> {
    return requestJson<User>("/auth/me", "Impossible de charger votre compte.");
}

/** POST /auth/register — creation d'un compte par un administrateur. */
export function createUser(input: CreateUserInput): Promise<void> {
    return request(
        "/auth/register",
        { method: "POST", body: JSON.stringify(input) },
        "La creation du compte a echoue.",
    );
}

/**
 * PUT /auth/update/{email} — l'email de la route identifie le compte a modifier,
 * celui du corps est la nouvelle valeur (les deux different lors d'un renommage).
 */
export function updateUser(email: string, input: UpdateUserInput): Promise<void> {
    return request(
        `/auth/update/${encodeURIComponent(email)}`,
        { method: "PUT", body: JSON.stringify(input) },
        "La mise a jour du compte a echoue.",
    );
}

/** DELETE /auth/delete/{email}. */
export function deleteUser(email: string): Promise<void> {
    return request(
        `/auth/delete/${encodeURIComponent(email)}`,
        { method: "DELETE" },
        "La suppression du compte a echoue.",
    );
}

/** POST /auth/change-password — l'utilisateur connecte change son mot de passe. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request(
        "/auth/change-password",
        { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) },
        "Le changement de mot de passe a echoue.",
    );
}
