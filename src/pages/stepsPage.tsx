import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
    createStep,
    deleteStep,
    findPreviousStepCodes,
    getTemplateSteps,
    LEGISLATION_ROUTES,
    STEP_TYPES,
    StepServiceError,
    updateStep,
    type LegislationRoute,
    type StepInput,
    type StepType,
    type TemplateStep,
} from "../services/steps";
import '../styles/pages/stepsPage.css'

/** Ce que chaque type d'etape ajoute au tronc commun. */
const TYPE_LABELS: Record<StepType, string> = {
    Standard: "Standard",
    Question: "Question",
    Rag: "Legislation",
    Send: "Envoi",
};

const TYPE_HINTS: Record<StepType, string> = {
    Standard: "Maillon simple : un seul successeur, franchi sans intervention.",
    Question: "Noeud de decision : l'utilisateur choisit parmi les successeurs.",
    Rag: "Interroge le service de legislation puis poursuit automatiquement.",
    Send: "Bloque la construction tant que le courriel n'est pas parti.",
};

const EMPTY_FORM: StepInput = {
    type: "Standard",
    code: "",
    name: "",
    description: "",
    endPhase: false,
    endSection: false,
    definitionOfDone: "",
    informationSource: "",
    originalSource: "",
    question: "",
    legislationURLRoute: "tarifs",
    possibleNextSteps: [],
    previousSteps: [],
};

type Mode = { kind: "create" } | { kind: "edit"; code: string };

function TextField({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    hint,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    hint?: string;
}) {
    const id = useId();
    return (
        <div className="stepsField">
            <label className="stepsFieldLabel" htmlFor={id}>{label}</label>
            <input
                id={id}
                className="stepsInput"
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                autoComplete="off"
            />
            {hint && <p className="stepsFieldHint">{hint}</p>}
        </div>
    );
}

function TextArea({
    label,
    value,
    onChange,
    rows = 3,
    required = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    required?: boolean;
}) {
    const id = useId();
    return (
        <div className="stepsField">
            <label className="stepsFieldLabel" htmlFor={id}>{label}</label>
            <textarea
                id={id}
                className="stepsInput stepsTextarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={rows}
                required={required}
            />
        </div>
    );
}

/**
 * Selection des etapes liees (successeurs ou predecesseurs).
 * Le catalogue peut etre long : un filtre evite d'avoir a derouler la liste.
 */
function StepPicker({
    label,
    hint,
    options,
    selected,
    onToggle,
}: {
    label: string;
    hint: string;
    options: TemplateStep[];
    selected: string[];
    onToggle: (code: string) => void;
}) {
    const [filter, setFilter] = useState("");

    const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (needle === "") return options;
        return options.filter(
            (step) =>
                step.code.toLowerCase().includes(needle) ||
                step.name.toLowerCase().includes(needle),
        );
    }, [options, filter]);

    return (
        <div className="stepsField">
            <span className="stepsFieldLabel">{label}</span>
            <p className="stepsFieldHint">{hint}</p>

            <input
                className="stepsInput"
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrer par code ou nom..."
                autoComplete="off"
            />

            <ul className="stepsPicker">
                {visible.length === 0 ? (
                    <li className="stepsPickerEmpty">Aucune etape.</li>
                ) : (
                    visible.map((step) => (
                        <li key={step.code}>
                            <label className="stepsPickerItem">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(step.code)}
                                    onChange={() => onToggle(step.code)}
                                />
                                <span className="stepsPickerCode">{step.code}</span>
                                <span className="stepsPickerName">{step.name}</span>
                            </label>
                        </li>
                    ))
                )}
            </ul>

            {selected.length > 0 && (
                <p className="stepsFieldHint">
                    {selected.length} selectionnee{selected.length > 1 ? "s" : ""} : {selected.join(", ")}
                </p>
            )}
        </div>
    );
}

/**
 * Catalogue des etapes (route protegee).
 *
 * La table Steps est le gabarit dont chaque processus est tire : une etape y
 * decrit un maillon et ses successeurs possibles. Cette page en fait le CRUD
 * complet (cf. StepController).
 *
 * Deux points structurants :
 *  - le type d'une etape est fige a la creation : le backend refuse une mise a
 *    jour dont le DTO ne correspond pas au type stocke ;
 *  - une mise a jour reecrit integralement les liens (successeurs comme
 *    predecesseurs), d'ou le prechargement des listes avant edition.
 */
function StepsPage() {
    const [steps, setSteps] = useState<TemplateStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [mode, setMode] = useState<Mode>({ kind: "create" });
    const [form, setForm] = useState<StepInput>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [notice, setNotice] = useState("");

    // Suppression en deux temps : le second clic sur la meme ligne confirme.
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<StepType | "">("");

    const isEditing = mode.kind === "edit";

    const loadSteps = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            setSteps(await getTemplateSteps());
        } catch (caught) {
            setLoadError(caught instanceof StepServiceError
                ? caught.message
                : "Impossible de charger les etapes.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadSteps(); }, [loadSteps]);

    const setField = <K extends keyof StepInput>(key: K) => (value: StepInput[K]) =>
        setForm((previous) => ({ ...previous, [key]: value }));

    const toggleIn = (key: "possibleNextSteps" | "previousSteps") => (code: string) =>
        setForm((previous) => ({
            ...previous,
            [key]: previous[key].includes(code)
                ? previous[key].filter((c) => c !== code)
                : [...previous[key], code],
        }));

    const startCreate = () => {
        setMode({ kind: "create" });
        setForm(EMPTY_FORM);
        setFormError("");
        setNotice("");
        setPendingDelete(null);
    };

    const startEdit = (step: TemplateStep) => {
        setMode({ kind: "edit", code: step.code });
        setForm({
            type: step.type,
            code: step.code,
            name: step.name,
            description: step.description ?? "",
            endPhase: step.endPhase,
            endSection: step.endSection,
            definitionOfDone: step.definitionOfDone,
            informationSource: step.informationSource ?? "",
            originalSource: step.originalSource ?? "",
            question: step.question ?? "",
            legislationURLRoute: step.legislationURLRoute ?? "tarifs",
            // Les liens sont reecrits en entier par le PUT : on repart de l'etat
            // courant pour qu'une modification de detail ne casse pas le graphe.
            possibleNextSteps: step.possibleNextStepCodes,
            previousSteps: findPreviousStepCodes(steps, step.code),
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
                await createStep(form);
                setNotice(`Etape ${form.code.trim()} creee.`);
                setForm(EMPTY_FORM);
            } else {
                await updateStep(mode.code, form);
                const updated = mode.code;
                startCreate();
                setNotice(`Etape ${updated} mise a jour.`);
            }

            await loadSteps();
        } catch (caught) {
            setFormError(caught instanceof StepServiceError
                ? caught.message
                : "L'operation a echoue.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (step: TemplateStep) => {
        setFormError("");
        setNotice("");

        try {
            await deleteStep(step.code);
            setNotice(`Etape ${step.code} supprimee.`);
            if (mode.kind === "edit" && mode.code === step.code) startCreate();
            await loadSteps();
        } catch (caught) {
            // Un 409 remonte ici : l'etape est encore referencee.
            setLoadError(caught instanceof StepServiceError
                ? caught.message
                : "La suppression a echoue.");
        } finally {
            setPendingDelete(null);
        }
    };

    // Une etape ne peut pas etre son propre successeur.
    const linkableSteps = useMemo(
        () => (isEditing ? steps.filter((step) => step.code !== mode.code) : steps),
        [steps, isEditing, mode],
    );

    const visibleSteps = useMemo(
        () => (typeFilter === "" ? steps : steps.filter((step) => step.type === typeFilter)),
        [steps, typeFilter],
    );

    const needsQuestion = form.type === "Question" || form.type === "Rag";

    return (
        <div id="stepsPage">
            <aside className="stepsRail">
                <section className="stepsPanel">
                    <h2 className="stepsPanelTitle">
                        {isEditing ? `Modifier ${mode.code}` : "Nouvelle etape"}
                    </h2>
                    <p className="stepsPanelHint">
                        {isEditing
                            ? "Le code et le type sont figes : le backend refuse un changement de type."
                            : "Le code identifie l'etape dans le gabarit. Il ne pourra plus etre modifie."}
                    </p>

                    <form className="stepsForm" onSubmit={handleSubmit}>
                        <div className="stepsField">
                            <span className="stepsFieldLabel">Type</span>
                            <div className="stepsTypeChoice">
                                {STEP_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={
                                            form.type === type
                                                ? "stepsTypeOption stepsTypeOption--picked"
                                                : "stepsTypeOption"
                                        }
                                        onClick={() => setField("type")(type)}
                                        disabled={isEditing}
                                        title={TYPE_HINTS[type]}
                                    >
                                        {TYPE_LABELS[type]}
                                    </button>
                                ))}
                            </div>
                            <p className="stepsFieldHint">{TYPE_HINTS[form.type]}</p>
                        </div>

                        <TextField
                            label="Code"
                            value={form.code}
                            onChange={setField("code")}
                            placeholder="A-3.10"
                            required={!isEditing}
                            disabled={isEditing}
                        />

                        <TextField
                            label="Nom"
                            value={form.name}
                            onChange={setField("name")}
                            required
                        />

                        <TextArea
                            label="Description"
                            value={form.description}
                            onChange={setField("description")}
                        />

                        <TextArea
                            label="Definition of done"
                            value={form.definitionOfDone}
                            onChange={setField("definitionOfDone")}
                            rows={2}
                            required
                        />

                        {needsQuestion && (
                            <TextArea
                                label={form.type === "Question" ? "Question posee" : "Question au service"}
                                value={form.question}
                                onChange={setField("question")}
                                rows={2}
                                required
                            />
                        )}

                        {form.type === "Rag" && (
                            <div className="stepsField">
                                <span className="stepsFieldLabel">Route de legislation</span>
                                <div className="stepsTypeChoice">
                                    {LEGISLATION_ROUTES.map((route) => (
                                        <button
                                            key={route}
                                            type="button"
                                            className={
                                                form.legislationURLRoute === route
                                                    ? "stepsTypeOption stepsTypeOption--picked"
                                                    : "stepsTypeOption"
                                            }
                                            onClick={() => setField("legislationURLRoute")(route as LegislationRoute)}
                                        >
                                            {route}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="stepsToggles">
                            <label className="stepsToggle">
                                <input
                                    type="checkbox"
                                    checked={form.endPhase}
                                    onChange={(e) => setField("endPhase")(e.target.checked)}
                                />
                                <span>Termine la phase</span>
                            </label>
                            <label className="stepsToggle">
                                <input
                                    type="checkbox"
                                    checked={form.endSection}
                                    onChange={(e) => setField("endSection")(e.target.checked)}
                                />
                                <span>Termine la section</span>
                            </label>
                        </div>

                        <TextField
                            label="Source d'information"
                            value={form.informationSource}
                            onChange={setField("informationSource")}
                        />

                        <TextField
                            label="Source originale"
                            value={form.originalSource}
                            onChange={setField("originalSource")}
                        />

                        <StepPicker
                            label="Etapes suivantes"
                            hint={
                                form.type === "Question"
                                    ? "Les choix proposes a l'utilisateur sur ce noeud de decision."
                                    : "Le successeur franchi automatiquement apres cette etape."
                            }
                            options={linkableSteps}
                            selected={form.possibleNextSteps}
                            onToggle={toggleIn("possibleNextSteps")}
                        />

                        <StepPicker
                            label="Etapes precedentes"
                            hint="Les etapes qui menent a celle-ci. Le backend recable les liens en consequence."
                            options={linkableSteps}
                            selected={form.previousSteps}
                            onToggle={toggleIn("previousSteps")}
                        />

                        {formError && <p className="stepsError">{formError}</p>}

                        <div className="stepsFormActions">
                            <button className="stepsPrimaryButton" type="submit" disabled={submitting}>
                                {submitting
                                    ? "Envoi..."
                                    : isEditing ? "Enregistrer" : "Creer l'etape"}
                            </button>
                            {isEditing && (
                                <button
                                    className="stepsGhostButton"
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

            <main className="stepsStage">
                <header className="stepsStageHead">
                    <div>
                        <p className="stepsStageEyebrow">Gabarit des processus</p>
                        <h1 className="stepsStageTitle">Etapes</h1>
                    </div>
                    <span className="stepsCount">
                        {visibleSteps.length} / {steps.length} etape{steps.length > 1 ? "s" : ""}
                    </span>
                </header>

                <div className="stepsFilters">
                    <button
                        type="button"
                        className={typeFilter === "" ? "stepsFilter stepsFilter--picked" : "stepsFilter"}
                        onClick={() => setTypeFilter("")}
                    >
                        Toutes
                    </button>
                    {STEP_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            className={typeFilter === type ? "stepsFilter stepsFilter--picked" : "stepsFilter"}
                            onClick={() => setTypeFilter(type)}
                        >
                            {TYPE_LABELS[type]}
                        </button>
                    ))}
                </div>

                {notice && <p className="stepsNotice">{notice}</p>}
                {loadError && <p className="stepsError stepsError--stage">{loadError}</p>}

                {loading ? (
                    <p className="stepsPlaceholder">Chargement du gabarit...</p>
                ) : visibleSteps.length === 0 ? (
                    <p className="stepsPlaceholder">Aucune etape dans ce filtre.</p>
                ) : (
                    <ul className="stepsList">
                        {visibleSteps.map((step) => {
                            const isBeingEdited = mode.kind === "edit" && mode.code === step.code;

                            return (
                                <li
                                    key={step.code}
                                    className={isBeingEdited ? "stepsRow stepsRow--editing" : "stepsRow"}
                                >
                                    <div className="stepsRowIdentity">
                                        <span className="stepsRowHead">
                                            <span className="stepsRowCode">{step.code}</span>
                                            <span className={`stepsTag stepsTag--${step.type.toLowerCase()}`}>
                                                {TYPE_LABELS[step.type]}
                                            </span>
                                            {step.endPhase && <span className="stepsFlag">fin de phase</span>}
                                            {step.endSection && <span className="stepsFlag">fin de section</span>}
                                        </span>
                                        <span className="stepsRowName">{step.name}</span>
                                        {step.possibleNextStepCodes.length > 0 && (
                                            <span className="stepsRowLinks">
                                                → {step.possibleNextStepCodes.join(", ")}
                                            </span>
                                        )}
                                    </div>

                                    <div className="stepsRowActions">
                                        {pendingDelete === step.code ? (
                                            <>
                                                <span className="stepsConfirmLabel">Supprimer ?</span>
                                                <button
                                                    className="stepsDangerButton"
                                                    type="button"
                                                    onClick={() => void handleDelete(step)}
                                                >
                                                    Confirmer
                                                </button>
                                                <button
                                                    className="stepsGhostButton"
                                                    type="button"
                                                    onClick={() => setPendingDelete(null)}
                                                >
                                                    Annuler
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="stepsGhostButton"
                                                    type="button"
                                                    onClick={() => startEdit(step)}
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    className="stepsGhostButton stepsGhostButton--danger"
                                                    type="button"
                                                    onClick={() => setPendingDelete(step.code)}
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

export default StepsPage;
