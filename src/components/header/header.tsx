import { NavLink, useNavigate, useLocation } from "react-router-dom";
import '../../styles/header.css'
import { useAuth } from "../../context/AuthContext";

/**
 * Header principal du SVO viewer.
 *
 * Navigation via React Router (NavLink / useNavigate).
 * Etat d'authentification lu depuis le contexte (useAuth).
 */

function HeaderLogo({ title }: { title: string }) {
    const navigate = useNavigate();

    return (
        <div onClick={() => navigate("/")} className="headerLogo">
            <div>{title}</div>
        </div>
    )
}

export function HeaderTitle({ title }: { title: string }) {
    return (
        <div className="headerTitle">
            <div>{title}</div>
        </div>
    )
}

function HeaderTab({ title, to }: { title: string; to: string }) {
    const navigate = useNavigate();
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <div
            onClick={() => navigate(to)}
            className={isActive ? "headerTab headerTab--active" : "headerTab"}
        >
            <div className="HeaderTabTitle">{title}</div>
        </div>
    )
}

function HeaderTabHolder() {
    const { role, isAuthenticated } = useAuth();
    return (
        <div className="headerTabHolder">
            {/* Onglet visible uniquement apres connexion */}
            {isAuthenticated && <HeaderTab title="Processus" to="/processus" />}
            {/* Gestion des comptes : reservee aux administrateurs */}
            {role === "Admin" && <HeaderTab title="Utilisateurs" to="/utilisateurs" />}
        </div>
    )
}

/**
 * Initiales tirees de l'email : "jane.doe@capd.ca" -> "JD".
 * Renvoie "" quand rien d'exploitable n'est disponible (l'appelant retombe
 * alors sur le role).
 */
function initialsFrom(email: string): string {
    const local = email.split("@")[0] ?? "";
    const parts = local.split(/[._\-+]+/).filter(Boolean);

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function HeaderAccountSection() {
    const { role, email, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    // Une session ouverte avant la memorisation de l'email n'en a pas : le role
    // fait alors office de pastille.
    const initials = initialsFrom(email) || role.slice(0, 2).toUpperCase() || "?";

    return (
        <div className="headerAccountSection">
            {isAuthenticated ? (
                <>
                    {/* Acces au profil de l'utilisateur connecte */}
                    <NavLink to="/profile" className="headerProfileLink" title={email || role}>
                        <p id="headerAccountSectionName">{role}</p>
                        <div className="headerAvatar" aria-hidden="true">{initials}</div>
                    </NavLink>
                    <button className="headerAuthButton" onClick={handleLogout}>Logout</button>
                </>
            ) : (
                <button className="headerAuthButton" onClick={() => navigate("/login")}>Login</button>
            )}
        </div>
    )
}

function Header() {
    return (
        <div id="header">
            <HeaderLogo title="Carnet d'opération" />
            <HeaderTabHolder />
            <HeaderAccountSection />
        </div>
    )
}

export default Header;
