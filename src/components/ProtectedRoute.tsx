import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../services/auth";

/**
 * Garde de route. Protege les routes imbriquees :
 *  - non connecte           -> redirige vers /login
 *  - role non autorise      -> redirige vers /
 *
 * Usage :
 *   <Route element={<ProtectedRoute />}> ... </Route>
 *   <Route element={<ProtectedRoute allowedRoles={["Admin"]} />}> ... </Route>
 */
export default function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
    const { role, isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
