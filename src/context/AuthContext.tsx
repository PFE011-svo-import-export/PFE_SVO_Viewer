import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authService from "../services/auth";
import type { LoginResult, UserRole } from "../services/auth";

/**
 * Etat d'authentification partage par toute l'application (cross-cutting).
 * Le Header, les routes protegees et les pages le lisent via useAuth().
 */
interface AuthContextValue {
    role: UserRole;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    // Initialise depuis le stockage local pour rester connecte au rechargement.
    const [role, setRole] = useState<UserRole>(authService.getStoredRole());

    // Un appel authentifie revenu en 401 (token expire) deconnecte l'utilisateur.
    useEffect(() => {
        const onUnauthorized = () => setRole("");
        window.addEventListener(authService.AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(authService.AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const login = async (email: string, password: string): Promise<LoginResult> => {
        const result = await authService.login(email, password);
        if (result.ok) setRole(result.role);
        return result;
    };

    const logout = () => {
        authService.logout();
        setRole("");
    };

    const value: AuthContextValue = {
        role,
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
