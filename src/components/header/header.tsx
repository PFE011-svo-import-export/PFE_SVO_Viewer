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
    const { isAuthenticated } = useAuth();
    return (
        <div className="headerTabHolder">
            <HeaderTab title="CAFÉ" to="/simulation" />
            <HeaderTab title="CAPD" to="/info" />
            {/* Onglet visible uniquement apres connexion */}
            {isAuthenticated && <HeaderTab title="Processus" to="/processus" />}
        </div>
    )
}

function HeaderAccountSection() {
    const { role, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    return (
        <div className="headerAccountSection">
            {isAuthenticated ? (
                <>
                    {/* Acces au profil de l'utilisateur connecte */}
                    <NavLink to="/profile" className="headerProfileLink">
                        <p id="headerAccountSectionName">{role}</p>
                        <div id="headerAccountSectionPlaceHolder"></div>
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
            <HeaderLogo title="Simulateur" />
            <HeaderTabHolder />
            <HeaderAccountSection />
        </div>
    )
}

export default Header;
