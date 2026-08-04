import { useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/passwordInput";
import { changePassword, getCurrentUser, UserServiceError, type User } from "../services/users";
import '../styles/pages/profilePage.css'

/** Les trois champs du formulaire ont la meme forme : etiquette + champ revelable. */
function PasswordField({
    label,
    value,
    onChange,
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete: string;
}) {
    // L'etiquette pointe le champ par id : le bouton oeil ne peut pas vivre
    // a l'interieur d'un <label>.
    const id = useId();

    return (
        <div className="profileField">
            <label className="profileFieldLabel" htmlFor={id}>{label}</label>
            <PasswordInput
                id={id}
                className="profileInput"
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                required
            />
        </div>
    );
}

/**
 * Profil de l'utilisateur connecte (route protegee, tous roles).
 *
 * Les informations viennent de GET /auth/me : le viewer ne decode jamais le JWT.
 * Chacun peut changer son propre mot de passe ; la gestion des autres comptes
 * vit sur /utilisateurs et reste reservee aux administrateurs.
 */
function ProfilePage() {
    const { role } = useAuth();

    const [user, setUser] = useState<User | null>(null);
    const [loadError, setLoadError] = useState("");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let cancelled = false;

        getCurrentUser()
            .then((result) => { if (!cancelled) setUser(result); })
            .catch((caught) => {
                if (cancelled) return;
                setLoadError(caught instanceof UserServiceError
                    ? caught.message
                    : "Impossible de charger votre compte.");
            });

        return () => { cancelled = true; };
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError("");
        setNotice("");

        // Verifie ici ce que le serveur ne peut pas voir : la saisie repetee.
        if (newPassword !== confirmation) {
            setFormError("Les deux mots de passe ne correspondent pas.");
            return;
        }

        setSubmitting(true);
        try {
            await changePassword(currentPassword, newPassword);
            setNotice("Mot de passe modifie avec succes.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmation("");
        } catch (caught) {
            setFormError(caught instanceof UserServiceError
                ? caught.message
                : "Le changement de mot de passe a echoue.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div id="profilePage">
            <header className="profileHead">
                <p className="profileEyebrow">Votre compte</p>
                <h1 className="profileTitle">
                    {user ? `${user.firstName} ${user.lastName}` : "Profil"}
                </h1>
            </header>

            {loadError && <p className="profileError">{loadError}</p>}

            <section className="profilePanel">
                <h2 className="profilePanelTitle">Identite</h2>
                <dl className="profileIdentity">
                    <div>
                        <dt>Email</dt>
                        <dd>{user?.email ?? "—"}</dd>
                    </div>
                    <div>
                        <dt>Role</dt>
                        <dd>{user?.role || role || "—"}</dd>
                    </div>
                </dl>
            </section>

            <section className="profilePanel">
                <h2 className="profilePanelTitle">Changer le mot de passe</h2>

                <form className="profileForm" onSubmit={handleSubmit}>
                    <PasswordField
                        label="Mot de passe actuel"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        autoComplete="current-password"
                    />

                    <PasswordField
                        label="Nouveau mot de passe"
                        value={newPassword}
                        onChange={setNewPassword}
                        autoComplete="new-password"
                    />

                    <PasswordField
                        label="Confirmation"
                        value={confirmation}
                        onChange={setConfirmation}
                        autoComplete="new-password"
                    />


                    {formError && <p className="profileError">{formError}</p>}
                    {notice && <p className="profileNotice">{notice}</p>}

                    <button className="profilePrimaryButton" type="submit" disabled={submitting}>
                        {submitting ? "Envoi..." : "Mettre a jour"}
                    </button>
                </form>
            </section>
        </div>
    )
}

export default ProfilePage;
