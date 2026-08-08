import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authService from "../services/auth";
import type { LoginResult, UserRole } from "../services/auth";

/**
 * Etat d'authentification partage par toute l'application (cross-cutting).
 * Le Header, les routes protegees et les pages le lisent via useAuth().
 */
interface AuthContextValue {
    role: UserRole;
    /** Email du compte connecte ("" si personne n'est connecte). */
    email: string;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    // Initialise depuis le stockage local pour rester connecte au rechargement.
    const [role, setRole] = useState<UserRole>(authService.getStoredRole());
    const [email, setEmail] = useState<string>(authService.getStoredEmail());

    // Un appel authentifie revenu en 401 (token expire) deconnecte l'utilisateur.
    useEffect(() => {
        const onUnauthorized = () => {
            setRole("");
            setEmail("");
        };
        window.addEventListener(authService.AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(authService.AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const login = async (emailInput: string, password: string): Promise<LoginResult> => {
        const result = await authService.login(emailInput, password);
        if (result.ok) {
            setRole(result.role);
            setEmail(result.email);
        }
        return result;
    };

    const logout = () => {
        authService.logout();
        setRole("");
        setEmail("");
    };

    const value: AuthContextValue = {
        role,
        email,
        isAuthenticated: role !== "",
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth doit etre utilise a l'interieur d'un <AuthProvider>.");
    return ctx;
}
