import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/passwordInput";
import {
    createUser,
    deleteUser,
    getUsers,
    updateUser,
    UserServiceError,
    type User,
} from "../services/users";
import '../styles/pages/usersPage.css'

/** Roles que l'administrateur peut attribuer (cf. AuthController.AssignableRoles). */
const ROLES = ["Admin", "CAPD"] as const;
type AssignableRole = (typeof ROLES)[number];

/** Le formulaire sert a la creation et a la modification : meme champs, deux modes. */
interface FormState {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: AssignableRole;
}

const EMPTY_FORM: FormState = {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "CAPD",
};

/**
 * Mode du panneau de saisie. En edition, on garde l'email d'origine : c'est lui
 * qui identifie le compte cote API, meme quand l'utilisateur change son email.
 */
type Mode = { kind: "create" } | { kind: "edit"; originalEmail: string };

function Field({
    label,
    type = "text",
    value,
    onChange,
    placeholder,
    required = false,
    autoComplete,
}: {
    label: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    autoComplete?: string;
}) {
    // L'etiquette pointe le champ par id : le bouton oeil du champ mot de passe
    // ne peut pas vivre a l'interieur d'un <label>.
    const id = useId();

    return (
        <div className="usersField">
            <label className="usersFieldLabel" htmlFor={id}>{label}</label>
            {type === "password" ? (
                <PasswordInput
                    id={id}
                    className="usersInput"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    autoComplete={autoComplete}
                />
            ) : (
                <input
                    id={id}
                    className="usersInput"
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required={required}
                    autoComplete={autoComplete}
                />
            )}
        </div>
    );
}

/**
 * Gestion des comptes (route reservee au role Admin).
 *
 * Le panneau de gauche cree ou modifie un compte, la liste de droite montre le
 * parc existant. Les regles (roles valides, compte courant non supprimable)
 * sont appliquees par l'API : l'interface les reflete pour eviter l'aller-retour.
 */
function UsersPage() {
    const { email: currentEmail } = useAuth();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [mode, setMode] = useState<Mode>({ kind: "create" });
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [notice, setNotice] = useState("");

    // Suppression en deux temps : le second clic sur la meme ligne confirme.
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const isEditing = mode.kind === "edit";

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            setUsers(await getUsers());
        } catch (caught) {
            setLoadError(caught instanceof UserServiceError
                ? caught.message
                : "Impossible de charger les utilisateurs.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadUsers(); }, [loadUsers]);

    const setField = (key: keyof FormState) => (value: string) =>
        setForm((previous) => ({ ...previous, [key]: value }));

    const startCreate = () => {
        setMode({ kind: "create" });
        setForm(EMPTY_FORM);
        setFormError("");
        setNotice("");
    };

    const startEdit = (user: User) => {
        setMode({ kind: "edit", originalEmail: user.email });
        setForm({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            // Le mot de passe n'est jamais relu : vide = inchange.
            password: "",
            role: user.role === "Admin" ? "Admin" : "CAPD",
        });
        setFormError("");
        setNotice("");
        setPendingDelete(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError("");
        setNotice("");
        setSubmitting(true);

        try {
            if (mode.kind === "create") {
                await createUser({
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim(),
                    password: form.password,
                    role: form.role,
                });
                setNotice(`Compte ${form.email.trim()} cree.`);
                setForm(EMPTY_FORM);
            } else {
                await updateUser(mode.originalEmail, {
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim(),
                    role: form.role,
                    // Champ laisse vide : le mot de passe actuel est conserve.
                    newPassword: form.password.trim() === "" ? undefined : form.password,
                });
                // startCreate() vide le bandeau : on le repose apres le retour au
                // mode creation.
                startCreate();
                setNotice(`Compte ${form.email.trim()} mis a jour.`);
            }

            await loadUsers();
        } catch (caught) {
            setFormError(caught instanceof UserServiceError
                ? caught.message
                : "L'operation a echoue.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (user: User) => {
        setFormError("");
        setNotice("");

        try {
            await deleteUser(user.email);
            setNotice(`Compte ${user.email} supprime.`);
            // Le compte en cours d'edition vient de disparaitre : on repart a neuf.
            if (mode.kind === "edit" && mode.originalEmail === user.email) startCreate();
            await loadUsers();
        } catch (caught) {
            setLoadError(caught instanceof UserServiceError
                ? caught.message
                : "La suppression a echoue.");
        } finally {
            setPendingDelete(null);
        }
    };

    return (
        <div id="usersPage">
            <aside className="usersRail">
                <section className="usersPanel">
                    <h2 className="usersPanelTitle">
                        {isEditing ? "Modifier le compte" : "Nouveau compte"}
                    </h2>
                    <p className="usersPanelHint">
                        {isEditing
                            ? "Les modifications prennent effet a la prochaine connexion du compte."
                            : "Le compte cree pourra se connecter immediatement avec le mot de passe saisi."}
                    </p>

                    <form className="usersForm" onSubmit={handleSubmit}>
                        <Field
                            label="Prenom"
                            value={form.firstName}
                            onChange={setField("firstName")}
                            required
                            autoComplete="off"
                        />
                        <Field
                            label="Nom"
                            value={form.lastName}
                            onChange={setField("lastName")}
                            required
                            autoComplete="off"
                        />
                        <Field
                            label="Email"
                            type="email"
                            value={form.email}
                            onChange={setField("email")}
                            required
                            autoComplete="off"
                        />
                        <Field
                            label={isEditing ? "Nouveau mot de passe" : "Mot de passe"}
                            type="password"
                            value={form.password}
                            onChange={setField("password")}
                            placeholder={isEditing ? "Laisser vide pour conserver" : undefined}
                            required={!isEditing}
                            autoComplete="new-password"
                        />

                        <div className="usersField">
                            <span className="usersFieldLabel">Role</span>
                            <div className="usersRoleChoice">
                                {ROLES.map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        className={
                                            form.role === role
                                                ? "usersRoleOption usersRoleOption--picked"
                                                : "usersRoleOption"
                                        }
                                        onClick={() => setForm((p) => ({ ...p, role }))}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {formError && <p className="usersError">{formError}</p>}

                        <div className="usersFormActions">
                            <button
                                className="usersPrimaryButton"
                                type="submit"
                                disabled={submitting}
                            >
                                {submitting
                                    ? "Envoi..."
                                    : isEditing ? "Enregistrer" : "Creer le compte"}
                            </button>
                            {isEditing && (
                                <button
                                    className="usersGhostButton"
                                    type="button"
                                    onClick={startCreate}
                                    disabled={submitting}
                                >
                                    Annuler
                                </button>
                            )}
                        </div>
                    </form>
                </section>
            </aside>

            <main className="usersStage">
                <header className="usersStageHead">
                    <div>
                        <p className="usersStageEyebrow">Gestion des acces</p>
                        <h1 className="usersStageTitle">Utilisateurs</h1>
                    </div>
                    <span className="usersCount">
                        {users.length} compte{users.length > 1 ? "s" : ""}
                    </span>
                </header>

                {notice && <p className="usersNotice">{notice}</p>}
                {loadError && <p className="usersError usersError--stage">{loadError}</p>}

                {loading ? (
                    <p className="usersPlaceholder">Chargement des comptes...</p>
                ) : users.length === 0 ? (
                    <p className="usersPlaceholder">Aucun compte enregistre.</p>
                ) : (
                    <ul className="usersList">
                        {users.map((user) => {
                            const isSelf = user.email.toLowerCase() === currentEmail.toLowerCase();
                            const isBeingEdited =
                                mode.kind === "edit" && mode.originalEmail === user.email;

                            return (
                                <li
                                    key={user.email}
                                    className={
                                        isBeingEdited ? "usersRow usersRow--editing" : "usersRow"
                                    }
                                >
                                    <div className="usersRowIdentity">
                                        <span className="usersRowName">
                                            {user.firstName} {user.lastName}
                                            {isSelf && <span className="usersSelfTag">vous</span>}
                                        </span>
                                        <span className="usersRowEmail">{user.email}</span>
                                    </div>

                                    <span
                                        className={`usersTag usersTag--${user.role.toLowerCase() || "none"}`}
                                    >
                                        {user.role || "Sans role"}
                                    </span>

                                    <div className="usersRowActions">
                                        {pendingDelete === user.email ? (
                                            <>
                                                <span className="usersConfirmLabel">Supprimer ?</span>
                                                <button
                                                    className="usersDangerButton"
                                                    type="button"
                                                    onClick={() => void handleDelete(user)}
                                                >
                                                    Confirmer
                                                </button>
                                                <button
                                                    className="usersGhostButton"
                                                    type="button"
                                                    onClick={() => setPendingDelete(null)}
                                                >
                                                    Annuler
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="usersGhostButton"
                                                    type="button"
                                                    onClick={() => startEdit(user)}
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    className="usersGhostButton usersGhostButton--danger"
                                                    type="button"
                                                    onClick={() => setPendingDelete(user.email)}
                                                    // Miroir du garde-fou serveur : on ne se supprime pas.
                                                    disabled={isSelf}
                                                    title={isSelf
                                                        ? "Vous ne pouvez pas supprimer votre propre compte."
                                                        : undefined}
                                                >
                                                    Supprimer
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </div>
    );
}

export default UsersPage;
