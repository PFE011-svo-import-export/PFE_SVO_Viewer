import { Navigate, Outlet, useLocation } from "react-router-dom";
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
    const location = useLocation();

    if (!isAuthenticated) {
        // On memorise la destination (query comprise) pour y revenir apres login.
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}
