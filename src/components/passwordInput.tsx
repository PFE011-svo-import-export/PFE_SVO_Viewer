import { useState } from "react";
import '../styles/passwordInput.css'

/**
 * Champ de mot de passe avec bouton de revelation.
 *
 * L'oeil bascule simplement le type de l'input : rien n'est stocke, rien ne
 * transite. L'etat repart masque a chaque montage, donc un champ revele ne le
 * reste pas d'une page a l'autre.
 *
 * La classe visuelle du champ reste celle de la page appelante (usersInput,
 * profileInput, ...) : ce composant n'apporte que le placement du bouton.
 */
function PasswordInput({
    id,
    className,
    value,
    onChange,
    placeholder,
    required = false,
    autoComplete,
}: {
    id?: string;
    className?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    autoComplete?: string;
}) {
    const [revealed, setRevealed] = useState(false);

    return (
        <div className="passwordField">
            <input
                id={id}
                className={className}
                type={revealed ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                autoComplete={autoComplete}
            />
            <button
                type="button"
                className="passwordToggle"
                onClick={() => setRevealed((previous) => !previous)}
                aria-label={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={revealed}
                title={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
                {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
        </div>
    );
}

function EyeIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    );
}

export default PasswordInput;
