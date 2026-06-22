import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import '../styles/pages/authPage.css'

/**
 * Page de connexion.
 *
 * Sequence : saisie des identifiants -> auth.login() (via le contexte) ->
 * en cas de succes, le role est mis a jour et on redirige vers l'accueil ;
 * en cas d'echec, on affiche le message d'erreur.
 */
function AuthPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        const result = await login(email, password);

        setLoading(false);
        if (result.ok) {
            navigate("/");
        } else {
            setError(result.error ?? "Echec de la connexion.");
        }
    };

    return (
        <div id="AuthPage">
            <div className="authTitle">Authentification</div>

            <form className="authForm" onSubmit={handleSubmit}>
                <div className="authInputHolder">
                    <label htmlFor="authEmail">Email</label>
                    <input
                        id="authEmail"
                        className="authFormInputField"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        required
                    />

                    <label htmlFor="authPassword">Mot de passe</label>
                    <input
                        id="authPassword"
                        className="authFormInputField"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </div>

                {error && <p className="authError">{error}</p>}

                <button className="authSubmit" type="submit" disabled={loading}>
                    {loading ? "Connexion..." : "Se connecter"}
                </button>
            </form>
        </div>
    );
}

export default AuthPage;
