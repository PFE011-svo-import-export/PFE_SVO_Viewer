import { useAuth } from "../context/AuthContext";
import '../styles/pages/profilePage.css'

/**
 * Profil de l'utilisateur connecte (route protegee).
 *
 * Pour l'instant on affiche le role (seule info dont dispose le viewer).
 * Nom / email necessiteront un endpoint backend (ex: GET /auth/me).
 */
function ProfilePage() {
    const { role } = useAuth();

    return (
        <div id="profilePage">
            <h2>Profil</h2>
            <p>Role : {role}</p>
        </div>
    )
}

export default ProfilePage;
