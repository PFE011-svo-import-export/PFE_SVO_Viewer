import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    getIncoterms,
    getMerchandise,
    getPorts,
    type Incoterm,
    type Merchandise,
    type Port,
} from "../services/catalog";
import {
    answerProcessStep,
    buildProcessCode,
    getProcesses,
    getStepByCode,
    parseAssembledStepCodes,
    sendStepEmail,
    startProcessBuild,
    type BuildStep,
    type ProcessBuildResult,
    type ProcessCriteria,
    type ProcessRecord,
    type QuestionBuildStep,
    type SendBuildStep,
} from "../services/process";
import "../styles/pages/processusPage.css";

/**
 * Page "Processus" — construction pas a pas d'un processus d'importation.
 *
 * Les 4 criteres sont choisis sur la page d'accueil et transmis par l'URL
 * (?codeSH=&departureCode=&arrivalCode=&incotermCode=) : la construction
 * demarre donc toute seule a l'arrivee.
 *
 * Le backend deroule le graphe d'etapes tout seul et rend la main a chaque
 * noeud de decision (QuestionStep) ou d'envoi (SendStep). Cette page :
 *  - affiche la chronologie complete des etapes deja assemblees;
 *  - fait choisir la branche a suivre puis appelle /process/build/answer;
 *  - permet d'envoyer le courriel attendu par une etape d'envoi.
 *
 * La reponse de build ne contient que l'etape en attente : la chronologie est
 * reconstruite depuis `assembledStepCodes` (GET /process/{id}) dont chaque code
 * est resolu via GET /steps/{code}.
 */

/** Le code d'une etape commence par la lettre de sa section (ex. "A-0.31"). */
const SECTIONS = [
    { letter: "A", label: "Approvisionnement" },
    { letter: "B", label: "Exportation" },
    { letter: "C", label: "Transport" },
    { letter: "D", label: "Importation" },
    { letter: "E", label: "Mise en marché" },
] as const;

/* ------------------------------------------------------------------ *
 *  Carrousel 3D
 *
 *  Les etapes ne se suivent plus dans le flux : elles sont empilees sur un
 *  meme plan, au centre du cadre. Le defilement ne deplace donc rien
 *  directement — il fait avancer un curseur continu (`progress`) dont on
 *  deduit, pour chaque carte, son ecart au centre. Celle qui est posee est
 *  pleine taille; celle d'avant et celle d'apres reculent (translateZ),
 *  basculent (rotateX) et s'estompent; au-dela, plus rien n'est peint.
 * ------------------------------------------------------------------ */

/** Course de defilement (px) pour passer d'une etape a la suivante. */
const DECK_SLOT = 160;
/** Doit rester aligne sur --deck-perspective (CSS) : sert a projeter le rail. */
const DECK_PERSPECTIVE = 1400;
/** Recul (px) et basculement (deg) appliques par cran d'ecart. */
const DECK_DEPTH = 520;
const DECK_TILT = 13;
/** Ce qui doit depasser de la carte voisine, au-dela du bord de la carte posee. */
const DECK_PEEK = 56;
const DECK_MIN_GAP = 150;
/** Ecart maximum entre deux cartes, en fraction de la hauteur visible. */
const DECK_MAX_GAP_RATIO = 0.46;
/** Au-dela de cet ecart, la carte sort de la scene. */
const DECK_RANGE = 1.85;
/** Part de la hauteur du cadre occupee par le rail : le reste fait la marge. */
const RAIL_SPAN = 0.94;
/** En dessous, la page entiere defile : on retombe sur une liste classique. */
const DECK_QUERY = "(min-width: 1025px)";

const STEP_TYPE_LABEL: Record<BuildStep["Type"], string> = {
    Standard: "Étape",
    Question: "Décision",
    Rag: "Analyse",
    Send: "Envoi",
};

function sectionOf(step: BuildStep): (typeof SECTIONS)[number] | null {
    const letter = step.code.charAt(0).toUpperCase();
    return SECTIONS.find((section) => section.letter === letter) ?? null;
}

/**
 * Une phase correspond au prefixe du code d'etape ("A-1.30" -> "A-1"), ce qui
 * recoupe exactement les frontieres marquees par EndPhase cote backend.
 */
function phaseKeyOf(step: BuildStep): string {
    return step.code.split(".")[0];
}

/** Libelles de presentation; on retombe sur la section si le code est inconnu. */
const PHASE_LABELS: Record<string, string> = {
    "A-0": "Inscriptions et licences",
    "A-1": "Prix et conformité",
    "A-2": "Bon de commande",
    "A-3": "Prestataires de services",
    "A-4": "Courtier en douane",
    "B-0": "Préparation et départ",
    "C-0": "Transport international",
    "D-0": "Arrivée et dédouanement",
    "D-1": "Acheminement local",
    "D-2": "Inspection et archivage",
};

function phaseLabelOf(key: string, step: BuildStep, rank: number): string {
    return PHASE_LABELS[key] ?? `${sectionOf(step)?.label ?? "Étapes"} · Phase ${rank}`;
}

/** Etape sur laquelle le backend s'est arrete, s'il y en a une. */
function pendingStepOf(result: ProcessBuildResult): BuildStep | null {
    if (result.Status === "Draft") return result.question;
    if (result.Status === "WaitingForSend") return result.sendStep;
    return null;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}

/** Un prix non calcule vaut double.MinValue cote backend : on n'affiche rien. */
function formatPrice(price: number | null | undefined): string {
    if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) return "—";
    return `${price.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} $`;
}

/* ------------------------------------------------------------------ *
 *  Petits composants de presentation
 * ------------------------------------------------------------------ */

/** Rappel en lecture seule des 4 criteres : ils se choisissent sur l'accueil. */
function PortraitPanel({ entries }: { entries: { label: string; value: string }[] }) {
    return (
        <dl className="processusPortrait">
            {entries.map((entry) => (
                <div key={entry.label}>
                    <dt>{entry.label}</dt>
                    <dd>{entry.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Documents produits ou référencés par l'étape. */
function StepDocuments({ step }: { step: BuildStep }) {
    if (step.documents.length === 0) return null;

    return (
        <div className="processusDocuments">
            <span className="processusDocumentsLabel">
                {step.Type === "Rag" ? "Sources de la réponse" : "Documents"}
            </span>
            <ul className="processusDocumentsList">
                {step.documents.map((document) => (
                    <li key={document.name} className="processusDocument">
                        <span className="processusDocumentIcon" aria-hidden="true">▤</span>
                        {document.name}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function SourceLinks({ step }: { step: BuildStep }) {
    if (!step.informationSource && !step.originalSource) return null;

    return (
        <div className="processusStepSources">
            {step.informationSource && (
                <a href={step.informationSource} target="_blank" rel="noreferrer" className="processusSourceLink">
                    Accéder à la démarche ↗
                </a>
            )}
            {step.originalSource && (
                <a href={step.originalSource} target="_blank" rel="noreferrer" className="processusSourceLink">
                    Source officielle ↗
                </a>
            )}
        </div>
    );
}

/** Carte d'une etape de la chronologie. Repliee par defaut, sauf l'etape courante. */
function StepCard({
    step,
    position,
    isCurrent,
    isActive,
    chosenLabel,
    children,
}: {
    step: BuildStep;
    position: number;
    /** Le build attend une action sur cette etape. */
    isCurrent: boolean;
    /** Le defilement est pose sur cette etape (grosse bille). */
    isActive: boolean;
    chosenLabel?: string;
    children?: ReactNode;
}) {
    const [expanded, setExpanded] = useState(isActive);

    // L'etape sur laquelle on est posé s'ouvre et prend toute la place; les
    // autres se replient en arriere-plan (le choix retenu, lui, reste visible).
    useEffect(() => {
        setExpanded(isActive);
    }, [isActive]);

    const hasDetails = Boolean(
        step.description || step.definitionOfDone || step.informationSource || step.originalSource ||
        step.documents.length > 0,
    );

    return (
        <article
            className={`processusStep${isCurrent ? " processusStep--current" : ""}${
                isActive ? " processusStep--active" : ""
            }`}
        >
            <div className="processusStepMarker" aria-hidden="true">
                <span className="processusStepDot" />
            </div>

            <div className="processusStepBody">
                <header
                    className={`processusStepHead${hasDetails ? " processusStepHead--clickable" : ""}`}
                    onClick={hasDetails ? () => setExpanded((open) => !open) : undefined}
                    role={hasDetails ? "button" : undefined}
                    tabIndex={hasDetails ? 0 : undefined}
                    onKeyDown={
                        hasDetails
                            ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setExpanded((open) => !open);
                                  }
                              }
                            : undefined
                    }
                >
                    <span className="processusStepIndex">{String(position).padStart(2, "0")}</span>
                    <div className="processusStepHeadText">
                        <div className="processusStepMeta">
                            <span className="processusStepCode">{step.code}</span>
                            <span className={`processusTag processusTag--${step.Type.toLowerCase()}`}>
                                {STEP_TYPE_LABEL[step.Type]}
                            </span>
                            {step.price > 0 && <span className="processusStepPrice">{formatPrice(step.price)}</span>}
                        </div>
                        <h3 className="processusStepName">{step.name}</h3>
                    </div>
                    {hasDetails && (
                        <span className={`processusChevron${expanded ? " processusChevron--open" : ""}`}>▾</span>
                    )}
                </header>

                {expanded && hasDetails && (
                    <div className="processusStepDetails">
                        {step.description && <p className="processusStepDescription">{step.description}</p>}
                        {step.definitionOfDone && (
                            <p className="processusStepDone">
                                <span className="processusStepDoneLabel">Terminé lorsque</span>
                                {step.definitionOfDone}
                            </p>
                        )}
                        {step.Type === "Rag" && step.responseValue !== null && step.responseValue !== undefined && (
                            <p className="processusStepRag">{String(step.responseValue)}</p>
                        )}
                        <StepDocuments step={step} />
                        <SourceLinks step={step} />
                    </div>
                )}

                {chosenLabel && (
                    <p className="processusStepChoice">
                        <span className="processusStepChoiceLabel">Choix retenu</span>
                        {chosenLabel}
                    </p>
                )}

                {children}
            </div>
        </article>
    );
}

/** Noeud de decision : l'utilisateur choisit la branche a suivre. */
function DecisionPanel({
    question,
    busy,
    onChoose,
}: {
    question: QuestionBuildStep;
    busy: boolean;
    onChoose: (option: BuildStep) => void;
}) {
    const [selected, setSelected] = useState("");

    return (
        <div className="processusDecision">
            <p className="processusDecisionQuestion">{question.question}</p>
            <p className="processusDecisionHint">
                {question.possibleNextSteps.length} suite{question.possibleNextSteps.length > 1 ? "s" : ""} possible
                {question.possibleNextSteps.length > 1 ? "s" : ""} — choisissez la branche à suivre.
            </p>

            <div className="processusOptions">
                {question.possibleNextSteps.map((option) => (
                    <button
                        key={option.code}
                        type="button"
                        className={`processusOption${selected === option.code ? " processusOption--picked" : ""}`}
                        disabled={busy}
                        onClick={() => {
                            setSelected(option.code);
                            onChoose(option);
                        }}
                    >
                        <span className="processusOptionCode">{option.code}</span>
                        <span className="processusOptionName">{option.name}</span>
                        {option.description && (
                            <span className="processusOptionDescription">{option.description}</span>
                        )}
                        <span className="processusOptionGo">
                            {busy && selected === option.code ? "Assemblage…" : "Suivre cette branche ►"}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Etape d'envoi : le processus reste bloque tant que le courriel n'est pas parti. */
function SendPanel({
    step,
    busy,
    onSend,
}: {
    step: SendBuildStep;
    busy: boolean;
    onSend: (payload: {
        recipientEmail: string;
        subject: string;
        message: string;
        productQuantity: string;
        quantityUnit: string;
        importantInformation: { key: string; value: string }[];
    }) => void;
}) {
    const [recipientEmail, setRecipientEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [productQuantity, setProductQuantity] = useState("");
    const [quantityUnit, setQuantityUnit] = useState("kg");
    const [extras, setExtras] = useState<{ key: string; value: string }[]>([]);

    const updateExtra = (index: number, patch: Partial<{ key: string; value: string }>) =>
        setExtras((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return (
        <form
            className="processusSend"
            onSubmit={(event) => {
                event.preventDefault();
                onSend({ recipientEmail, subject, message, productQuantity, quantityUnit, importantInformation: extras });
            }}
        >
            <p className="processusSendIntro">
                Cette étape attend l'envoi d'un courriel
                {step.professional ? ` à ${step.professional.companyName || step.professional.name}` : ""}. Le
                processus reprend automatiquement une fois le message parti.
            </p>

            <div className="processusSendGrid">
                <label className="processusField">
                    <span className="processusFieldLabel">Destinataire</span>
                    <input
                        className="processusInput"
                        type="email"
                        required
                        value={recipientEmail}
                        onChange={(event) => setRecipientEmail(event.target.value)}
                        placeholder="fournisseur@exemple.com"
                    />
                </label>

                <label className="processusField">
                    <span className="processusFieldLabel">Objet</span>
                    <input
                        className="processusInput"
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder={step.name}
                    />
                </label>

                <label className="processusField">
                    <span className="processusFieldLabel">Quantité</span>
                    <input
                        className="processusInput"
                        type="number"
                        min="0"
                        step="0.01"
                        value={productQuantity}
                        onChange={(event) => setProductQuantity(event.target.value)}
                    />
                </label>

                <label className="processusField">
                    <span className="processusFieldLabel">Unité</span>
                    <input
                        className="processusInput"
                        value={quantityUnit}
                        onChange={(event) => setQuantityUnit(event.target.value)}
                    />
                </label>
            </div>

            <label className="processusField">
                <span className="processusFieldLabel">Message</span>
                <textarea
                    className="processusInput processusTextarea"
                    rows={4}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Laisser vide pour utiliser le message généré par la plateforme."
                />
            </label>

            <div className="processusExtras">
                <div className="processusExtrasHead">
                    <span className="processusFieldLabel">Informations importantes</span>
                    <button
                        type="button"
                        className="processusGhostButton"
                        onClick={() => setExtras((rows) => [...rows, { key: "", value: "" }])}
                    >
                        + Ajouter
                    </button>
                </div>

                {extras.map((row, index) => (
                    <div key={index} className="processusExtraRow">
                        <input
                            className="processusInput"
                            value={row.key}
                            onChange={(event) => updateExtra(index, { key: event.target.value })}
                            placeholder="Intitulé"
                        />
                        <input
                            className="processusInput"
                            value={row.value}
                            onChange={(event) => updateExtra(index, { value: event.target.value })}
                            placeholder="Valeur"
                        />
                        <button
                            type="button"
                            className="processusGhostButton"
                            onClick={() => setExtras((rows) => rows.filter((_, i) => i !== index))}
                            aria-label="Retirer cette information"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <button type="submit" className="processusPrimaryButton" disabled={busy || !recipientEmail}>
                {busy ? "Envoi…" : "Envoyer et poursuivre ►"}
            </button>
        </form>
    );
}

/* ------------------------------------------------------------------ *
 *  Page
 * ------------------------------------------------------------------ */

type Busy = "" | "start" | "answer" | "send" | "open";

function ProcessusPage() {
    const [merchandises, setMerchandises] = useState<Merchandise[]>([]);
    const [departurePorts, setDeparturePorts] = useState<Port[]>([]);
    const [arrivalPorts, setArrivalPorts] = useState<Port[]>([]);
    const [incoterms, setIncoterms] = useState<Incoterm[]>([]);

    /** Criteres affiches : ceux de l'URL, ou ceux du processus consulte. */
    const [portrait, setPortrait] = useState<ProcessCriteria | null>(null);
    const [result, setResult] = useState<ProcessBuildResult | null>(null);
    const [processCode, setProcessCode] = useState("");
    const [timeline, setTimeline] = useState<BuildStep[]>([]);
    /** Branche retenue pour chaque QuestionStep deja repondue. */
    const [choices, setChoices] = useState<Record<string, string>>({});
    /** "build" = session active (on peut repondre), "review" = simple consultation. */
    const [mode, setMode] = useState<"idle" | "build" | "review">("idle");

    const [processes, setProcesses] = useState<ProcessRecord[]>([]);
    const [busy, setBusy] = useState<Busy>("");
    const [error, setError] = useState("");

    /** Evite de redemander une etape deja resolue via GET /steps/{code}. */
    const stepCache = useRef(new Map<string, BuildStep>());
    /** Etape sur laquelle le defilement est actuellement pose. */
    const [activePosition, setActivePosition] = useState(1);
    /** Criteres deja lances : garde-fou contre le double effet de StrictMode. */
    const autoStartedFor = useRef("");

    /* --- Carrousel 3D ----------------------------------------------------- */

    const deckScrollRef = useRef<HTMLDivElement>(null);
    /** Cartes montees, par position (1-based). */
    const cardRefs = useRef(new Map<number, HTMLElement>());
    const deckFrame = useRef(0);
    /** Hauteur visible du cadre : fixe la course, le calage et l'ecart. */
    const [deckHeight, setDeckHeight] = useState(0);
    const [deckEnabled, setDeckEnabled] = useState(
        () => typeof window !== "undefined" && window.matchMedia(DECK_QUERY).matches,
    );

    const registerCard = (position: number) => (element: HTMLDivElement | null) => {
        if (element) cardRefs.current.set(position, element);
        else cardRefs.current.delete(position);
    };

    /**
     * Pose chaque carte selon son ecart au centre. Applique en direct sur le
     * DOM : le rendu React ne suit pas le defilement image par image.
     */
    const applyDeck = useCallback(() => {
        const scroller = deckScrollRef.current;
        if (!scroller) return;

        const progress = scroller.scrollTop / DECK_SLOT;

        // L'ecart se mesure a l'ecran, sur la carte posee : elle seule est
        // deployee, donc elle seule dicte ou les voisines doivent depasser.
        const centered = cardRefs.current.get(Math.round(progress) + 1);
        const gap = Math.min(
            Math.max(DECK_MIN_GAP, scroller.clientHeight * DECK_MAX_GAP_RATIO),
            Math.max(DECK_MIN_GAP, (centered?.offsetHeight ?? 0) / 2 + DECK_PEEK),
        );

        cardRefs.current.forEach((card, position) => {
            const offset = position - 1 - progress;
            const distance = Math.abs(offset);

            if (distance > DECK_RANGE) {
                card.style.visibility = "hidden";
                card.style.opacity = "0";
                return;
            }

            const depth = distance * DECK_DEPTH;
            // La perspective resserre vers le centre ce qui recule : on divise
            // par ce facteur pour que l'ecart demande soit celui qu'on voit.
            const shrink = DECK_PERSPECTIVE / (DECK_PERSPECTIVE + depth);
            const screenY = offset * gap;
            const opacity =
                distance <= 1
                    ? 1 - 0.66 * distance
                    : Math.max(0, 0.34 * (1 - (distance - 1) / (DECK_RANGE - 1)));

            card.style.visibility = "visible";
            card.style.opacity = opacity.toFixed(3);
            card.style.zIndex = String(Math.max(0, Math.round(100 - distance * 20)));
            card.style.pointerEvents = distance < 0.5 ? "auto" : "none";
            card.style.filter = distance > 0.35 ? `blur(${((distance - 0.35) * 2.2).toFixed(2)}px)` : "none";
            card.style.transform =
                `translateY(calc(-50% + ${(screenY / shrink).toFixed(1)}px))` +
                ` translateZ(${(-depth).toFixed(1)}px)` +
                ` rotateX(${(-offset * DECK_TILT).toFixed(2)}deg)`;
        });
    }, []);

    /** Le defilement ne redessine qu'a l'image suivante. */
    const handleDeckScroll = useCallback(() => {
        if (deckFrame.current !== 0) return;

        deckFrame.current = requestAnimationFrame(() => {
            deckFrame.current = 0;
            applyDeck();

            const scroller = deckScrollRef.current;
            if (!scroller) return;

            const slots = Math.max(1, cardRefs.current.size);
            const settled = Math.min(slots, Math.max(1, Math.round(scroller.scrollTop / DECK_SLOT) + 1));
            setActivePosition((current) => (current === settled ? current : settled));
        });
    }, [applyDeck]);

    /** Amene une etape au centre : le calage se fait sur la course, pas sur le DOM. */
    const goToPosition = useCallback(
        (position: number, behavior: ScrollBehavior = "smooth") => {
            const scroller = deckScrollRef.current;
            if (!scroller) return;

            if (!deckEnabled) {
                cardRefs.current.get(position)?.scrollIntoView({ behavior, block: "center" });
                return;
            }

            scroller.scrollTo({ top: (position - 1) * DECK_SLOT, behavior });
        },
        [deckEnabled],
    );

    /**
     * Le calage rend les fleches inoperantes (un cran de clavier ne suffit pas
     * a franchir un cran de course) : on deplace donc le carrousel a la main.
     * Les champs de saisie gardent leurs fleches.
     */
    const handleDeckKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!deckEnabled || slotCount === 0) return;
        if ((event.target as HTMLElement).closest("input, textarea, select")) return;

        const move = (target: number) => {
            event.preventDefault();
            goToPosition(Math.min(slotCount, Math.max(1, target)));
        };

        switch (event.key) {
            case "ArrowDown":
            case "PageDown":
                return move(activePosition + 1);
            case "ArrowUp":
            case "PageUp":
                return move(activePosition - 1);
            case "Home":
                return move(1);
            case "End":
                return move(slotCount);
        }
    };

    useEffect(() => {
        const media = window.matchMedia(DECK_QUERY);
        const update = () => setDeckEnabled(media.matches);

        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    // La hauteur visible pilote la course, le calage du plan et l'ecart entre
    // les cartes : elle doit etre connue avant la premiere peinture.
    useLayoutEffect(() => {
        const scroller = deckScrollRef.current;
        if (!scroller || !deckEnabled) return;

        const observer = new ResizeObserver(() => setDeckHeight(scroller.clientHeight));
        observer.observe(scroller);
        setDeckHeight(scroller.clientHeight);

        return () => observer.disconnect();
    }, [deckEnabled]);

    // Toute nouvelle carte doit etre posee avant d'etre peinte, sinon elle
    // apparait empilee au centre le temps d'une image.
    useLayoutEffect(() => {
        if (!deckEnabled) {
            cardRefs.current.forEach((card) => card.removeAttribute("style"));
            return;
        }

        applyDeck();
    });

    useEffect(() => () => cancelAnimationFrame(deckFrame.current), []);

    /**
     * Mise en page etroite : la page entiere defile, il n'y a plus de course a
     * lire. L'etape "active" redevient celle qui traverse la bande centrale.
     */
    useEffect(() => {
        if (deckEnabled || timeline.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const crossing = entries.filter((entry) => entry.isIntersecting);
                if (crossing.length === 0) return;

                const nearest = crossing.reduce((best, entry) =>
                    entry.intersectionRatio >= best.intersectionRatio ? entry : best);
                const position = Number((nearest.target as HTMLElement).dataset.position);

                if (Number.isFinite(position)) setActivePosition(position);
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
        );

        cardRefs.current.forEach((card) => observer.observe(card));
        return () => observer.disconnect();
    }, [deckEnabled, timeline]);

    const [searchParams] = useSearchParams();

    // Criteres transmis par la page d'accueil. Les quatre sont requis.
    const urlCriteria = useMemo<ProcessCriteria | null>(() => {
        const codeSH = searchParams.get("codeSH") ?? "";
        const departureCode = searchParams.get("departureCode") ?? "";
        const arrivalCode = searchParams.get("arrivalCode") ?? "";
        const incotermCode = searchParams.get("incotermCode") ?? "";

        return codeSH && departureCode && arrivalCode && incotermCode
            ? { codeSH, departureCode, arrivalCode, incotermCode }
            : null;
    }, [searchParams]);

    useEffect(() => {
        let cancelled = false;

        Promise.all([getMerchandise(), getPorts("exporter"), getPorts("importer"), getIncoterms()])
            .then(([merchandiseList, departureList, arrivalList, incotermList]) => {
                if (cancelled) return;
                setMerchandises(merchandiseList);
                setDeparturePorts(departureList);
                setArrivalPorts(arrivalList);
                setIncoterms(incotermList);
            })
            .catch(() => {
                if (!cancelled) setError("Impossible de charger les données de référence.");
            });

        return () => { cancelled = true; };
    }, []);

    const refreshProcesses = useCallback(() => {
        getProcesses()
            .then(setProcesses)
            .catch(() => { /* liste secondaire : un echec ne bloque pas la construction */ });
    }, []);

    useEffect(refreshProcesses, [refreshProcesses]);

    const resolveSteps = useCallback(async (codes: string[]) => {
        // Un meme code peut revenir plusieurs fois si le graphe boucle.
        const missing = [...new Set(codes.filter((code) => !stepCache.current.has(code)))];

        if (missing.length > 0) {
            const fetched = await Promise.all(missing.map((code) => getStepByCode(code).catch(() => null)));
            fetched.forEach((step, index) => {
                if (step) stepCache.current.set(missing[index], step);
            });
        }

        return codes
            .map((code) => stepCache.current.get(code))
            .filter((step): step is BuildStep => step !== undefined);
    }, []);

    /**
     * La chronologie arrive maintenant dans la reponse : rien n'est lisible en
     * base tant que la construction n'est pas terminee.
     */
    const applyResult = useCallback((next: ProcessBuildResult) => {
        setResult(next);
        setProcessCode(next.processCode);
        setTimeline(next.assembledSteps);
    }, []);

    const startBuild = useCallback(
        async (criteria: ProcessCriteria) => {
            setBusy("start");
            setError("");
            stepCache.current.clear();
            setTimeline([]);
            setActivePosition(1);
            setChoices({});
            setResult(null);
            setPortrait(criteria);
            setProcessCode(buildProcessCode(criteria));
            setMode("build");

            try {
                applyResult(await startProcessBuild(criteria));
                refreshProcesses();
            } catch (caught) {
                setError(errorMessage(caught));
                setMode("idle");
            } finally {
                setBusy("");
            }
        },
        [applyResult, refreshProcesses],
    );

    // Arrivee depuis l'accueil : on lance la construction sans clic supplementaire.
    useEffect(() => {
        if (!urlCriteria) return;

        const key = buildProcessCode(urlCriteria);
        if (autoStartedFor.current === key) return;
        autoStartedFor.current = key;

        void startBuild(urlCriteria);
    }, [urlCriteria, startBuild]);

    const handleChoose = async (question: QuestionBuildStep, option: BuildStep) => {
        if (!result) return;

        setBusy("answer");
        setError("");
        setChoices((current) => ({ ...current, [question.code]: `${option.code} — ${option.name}` }));

        try {
            applyResult(await answerProcessStep(result.buildId, option.code));
            refreshProcesses();
        } catch (caught) {
            setError(errorMessage(caught));
            setChoices((current) => {
                const rollback = { ...current };
                delete rollback[question.code];
                return rollback;
            });
        } finally {
            setBusy("");
        }
    };

    const handleSend = async (
        step: SendBuildStep,
        payload: {
            recipientEmail: string;
            subject: string;
            message: string;
            productQuantity: string;
            quantityUnit: string;
            importantInformation: { key: string; value: string }[];
        },
    ) => {
        if (!result) return;

        setBusy("send");
        setError("");

        const importantInformation: Record<string, string> = {};
        payload.importantInformation.forEach(({ key, value }) => {
            if (key.trim() !== "" && value.trim() !== "") importantInformation[key.trim()] = value.trim();
        });

        const quantity = Number.parseFloat(payload.productQuantity);

        try {
            const sent = await sendStepEmail(step.code, {
                buildId: result.buildId,
                recipientEmail: payload.recipientEmail.trim(),
                subject: payload.subject.trim() || undefined,
                message: payload.message.trim() || undefined,
                productQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
                quantityUnit: payload.quantityUnit.trim() || "kg",
                importantInformation,
            });

            if (sent.processBuild) applyResult(sent.processBuild);
            refreshProcesses();
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy("");
        }
    };

    /** Consultation d'un processus deja enregistre (sans session de build active). */
    const handleOpen = async (record: ProcessRecord) => {
        setBusy("open");
        setError("");
        stepCache.current.clear();
        setTimeline([]);
        setActivePosition(1);
        setChoices({});
        setResult(null);
        setMode("review");
        setProcessCode(record.code);
        setPortrait({
            codeSH: record.codeSH,
            departureCode: record.departurePortCode,
            arrivalCode: record.arrivalPortCode,
            incotermCode: record.incotermCode,
        });

        try {
            setTimeline(await resolveSteps(parseAssembledStepCodes(record.assembledStepCodes)));
        } catch (caught) {
            setError(errorMessage(caught));
        } finally {
            setBusy("");
        }
    };

    const isCreated = result?.Status === "Created";
    /** Le bilan de fin occupe un cran de plus que la derniere etape. */
    const doneResult = result?.Status === "Created" ? result : null;
    const slotCount = timeline.length + (doneResult ? 1 : 0);

    /**
     * Position (1-based) de l'etape en attente. On prend la derniere occurrence :
     * le graphe peut repasser par un meme code et seule la plus recente est active.
     */
    const currentPosition = useMemo(() => {
        const pendingCode = result ? pendingStepOf(result)?.code : undefined;
        if (!pendingCode) return -1;
        return timeline.map((step) => step.code).lastIndexOf(pendingCode) + 1;
    }, [result, timeline]);

    /** Codes des criteres traduits en libelles, avec repli sur le code brut. */
    const portraitEntries = useMemo(() => {
        if (!portrait) return null;

        const merchandise = merchandises.find((item) => item.codeSH === portrait.codeSH);
        const departure = departurePorts.find((item) => item.code === portrait.departureCode);
        const arrival = arrivalPorts.find((item) => item.code === portrait.arrivalCode);
        const incoterm = incoterms.find((item) => item.code === portrait.incotermCode);

        return [
            { label: "Marchandise", value: merchandise?.name ?? portrait.codeSH },
            { label: "Port de départ", value: departure ? `${departure.name} — ${departure.city}` : portrait.departureCode },
            { label: "Port d'arrivée", value: arrival ? `${arrival.name} — ${arrival.city}` : portrait.arrivalCode },
            { label: "Incoterm", value: incoterm ? `${incoterm.code} — ${incoterm.name}` : portrait.incotermCode },
        ];
    }, [portrait, merchandises, departurePorts, arrivalPorts, incoterms]);

    const stats = useMemo(() => {
        const phases = timeline.filter((step) => step.endPhase).length;
        const sections = timeline.filter((step) => step.endSection).length;
        const price = timeline.reduce((total, step) => total + (step.price > 0 ? step.price : 0), 0);
        return { phases, sections, price };
    }, [timeline]);

    /** Chronologie regroupee par section (A → E) pour rester lisible. */
    /** Chronologie decoupee en phases : une phase = un groupe de la barre horizontale. */
    const phases = useMemo(() => {
        const grouped: {
            key: string;
            label: string;
            steps: { step: BuildStep; position: number }[];
        }[] = [];

        timeline.forEach((step, index) => {
            const key = phaseKeyOf(step);
            const last = grouped[grouped.length - 1];

            if (last && last.key === key) last.steps.push({ step, position: index + 1 });
            else grouped.push({
                key,
                label: phaseLabelOf(key, step, grouped.length + 1),
                steps: [{ step, position: index + 1 }],
            });
        });

        return grouped;
    }, [timeline]);

    // On defile jusqu'a l'etape en attente des qu'une nouvelle apparait, et on
    // revient au depart quand la chronologie est remise a zero.
    useEffect(() => {
        if (timeline.length === 0) {
            goToPosition(1, "auto");
            return;
        }

        if (currentPosition >= 1) goToPosition(currentPosition);
    }, [currentPosition, timeline.length, goToPosition]);

    /*
     * Geometrie des rails. Ils sont fixes : les billes se repartissent une fois
     * pour toutes sur la hauteur du cadre, du haut vers le bas, et n'obeissent
     * plus au defilement. Le plan sur lequel elles reposent est centre, d'ou
     * l'origine au milieu et des decalages qui vont de -h/2 a +h/2.
     */
    const railHeight = deckHeight * RAIL_SPAN;

    const railOffsetOf = (index: number) => {
        if (slotCount <= 1) return 0;
        return (index / (slotCount - 1) - 0.5) * railHeight;
    };

    /**
     * Phase posee : celle qui contient l'etape au centre. La carte de fin, qui
     * suit la derniere etape, reste rattachee a la derniere phase.
     */
    const activePhaseIndex = useMemo(() => {
        const index = phases.findIndex((phase) =>
            phase.steps.some((entry) => entry.position === activePosition));
        if (index >= 0) return index;

        return activePosition > timeline.length ? Math.max(phases.length - 1, 0) : 0;
    }, [phases, activePosition, timeline.length]);

    /**
     * Reperes du rail des phases : chaque bille se pose au milieu de l'etendue
     * de sa phase, donc en face du groupe d'etapes qu'elle couvre sur l'autre
     * ligne. Les deux rails se lisent ainsi a la meme hauteur.
     */
    const phaseMarks = useMemo(
        () =>
            phases.map((phase, index) => {
                const first = phase.steps[0].position;
                const last = phase.steps[phase.steps.length - 1].position;

                return { index, key: phase.key, label: phase.label, first, last };
            }),
        [phases],
    );

    /**
     * Reperes du rail des sections : meme principe, une echelle au-dessus.
     * Les etapes d'une meme section se suivent (leur code commence par sa
     * lettre), on regroupe donc les tranches consecutives.
     */
    const sectionMarks = useMemo(() => {
        const grouped: { letter: string; label: string; first: number; last: number }[] = [];

        timeline.forEach((step, index) => {
            const section = sectionOf(step);
            const letter = section?.letter ?? step.code.charAt(0).toUpperCase();
            const previous = grouped[grouped.length - 1];

            if (previous && previous.letter === letter) previous.last = index + 1;
            else grouped.push({ letter, label: section?.label ?? letter, first: index + 1, last: index + 1 });
        });

        return grouped;
    }, [timeline]);

    const activeSectionIndex = useMemo(() => {
        const index = sectionMarks.findIndex(
            (mark) => activePosition >= mark.first && activePosition <= mark.last);
        if (index >= 0) return index;

        return activePosition > timeline.length ? Math.max(sectionMarks.length - 1, 0) : 0;
    }, [sectionMarks, activePosition, timeline.length]);

    /*
     * L'ordre du document est celui de la lecture : le processus d'abord, ses
     * a-cotes ensuite. Le portrait, l'avancement et l'historique ne se
     * consultent qu'une fois le processus deroule — ils vivent donc sous la
     * chronologie, atteints en poursuivant le defilement.
     */
    const asideInfo = (
        <aside className="processusRail">
            <section className="processusPanel">
                <h2 className="processusPanelTitle">Portrait</h2>

                {portraitEntries ? (
                    <PortraitPanel entries={portraitEntries} />
                ) : (
                    <p className="processusPanelHint">
                        Aucun critère sélectionné. Choisissez-les sur la page d'accueil, puis lancez la
                        simulation.
                    </p>
                )}

                {/* Le retour aux criteres passe par l'accueil : le logo y mene. */}
                {urlCriteria && (
                    <div className="processusRailActions">
                        <button
                            type="button"
                            className="processusPrimaryButton"
                            onClick={() => startBuild(urlCriteria)}
                            disabled={busy !== ""}
                        >
                            {busy === "start" ? "Assemblage…" : "Relancer ►"}
                        </button>
                    </div>
                )}
            </section>

            {timeline.length > 0 && (
                <section className="processusPanel">
                    <h2 className="processusPanelTitle">Avancement</h2>
                    <dl className="processusStats">
                        <div>
                            <dt>Étapes</dt>
                            <dd>{timeline.length}</dd>
                        </div>
                        <div>
                            <dt>Phases</dt>
                            <dd>{stats.phases}</dd>
                        </div>
                        <div>
                            <dt>Sections</dt>
                            <dd>{stats.sections} / 5</dd>
                        </div>
                        <div>
                            <dt>Coût cumulé</dt>
                            <dd>{formatPrice(stats.price)}</dd>
                        </div>
                    </dl>

                    <ul className="processusSectionTrack">
                        {SECTIONS.map((section, index) => (
                            <li
                                key={section.letter}
                                className={`processusSectionPip${
                                    index < stats.sections
                                        ? " processusSectionPip--done"
                                        : index === stats.sections && !isCreated
                                          ? " processusSectionPip--active"
                                          : ""
                                }`}
                                title={section.label}
                            >
                                {section.letter}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="processusPanel">
                <h2 className="processusPanelTitle">Processus enregistrés</h2>
                {processes.length === 0 ? (
                    <p className="processusPanelHint">Aucun processus enregistré pour le moment.</p>
                ) : (
                    <ul className="processusList">
                        {[...processes].reverse().map((record) => (
                            <li key={record.id}>
                                <button
                                    type="button"
                                    className={`processusListItem${
                                        processCode === record.code && mode === "review"
                                            ? " processusListItem--active"
                                            : ""
                                    }`}
                                    onClick={() => handleOpen(record)}
                                    disabled={busy !== ""}
                                >
                                    <span className="processusListCode">{record.code}</span>
                                    <span className="processusListMeta">
                                        #{record.id} · {record.status}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </aside>
    );

    return (
        <div id="processusPage">
            <main className="processusStage">
                <header className="processusStageHead">
                    <h1 className="processusStageTitle">{processCode || "Aucun processus en cours"}</h1>
                </header>

                {error && (
                    <p className="processusError" role="alert">
                        {error}
                    </p>
                )}

                {timeline.length === 0 && !error && (
                    <div className="processusEmpty">
                        <p className="processusEmptyTitle">
                            {busy === "start"
                                ? "Assemblage du processus…"
                                : urlCriteria
                                  ? "Prêt à assembler"
                                  : "Aucun critère de simulation"}
                        </p>
                        <p className="processusEmptyHint">
                            {urlCriteria
                                ? "Chaque étape franchie s'affiche ici. Aux nœuds de décision, c'est vous qui choisissez la branche à suivre."
                                : "Sélectionnez la marchandise, les deux ports et l'incoterm sur la page d'accueil, puis cliquez sur « Simuler »."}
                        </p>
                        {!urlCriteria && (
                            <Link to="/" className="processusPrimaryButton processusLinkButton">
                                Aller aux critères ►
                            </Link>
                        )}
                    </div>
                )}

                {/* Sans etape, la bande du carrousel ne reserve pas sa hauteur. */}
                <div
                    className={`processusSteps${deckEnabled && slotCount > 0 ? " processusSteps--deck" : ""}`}
                    ref={deckScrollRef}
                    onScroll={deckEnabled ? handleDeckScroll : undefined}
                    onKeyDown={deckEnabled ? handleDeckKeys : undefined}
                    tabIndex={deckEnabled && slotCount > 0 ? 0 : undefined}
                    aria-label={deckEnabled && slotCount > 0 ? "Chronologie des étapes" : undefined}
                >
                    {/*
                     * Bloc de course : sa hauteur seule donne au cadre de quoi
                     * defiler (une longueur de cran par etape). Rien n'y est
                     * visible — les cartes vivent sur le plan fixe, en dessous.
                     */}
                    <div
                        className="processusDeck"
                        style={
                            deckEnabled
                                ? { height: `${deckHeight + Math.max(0, slotCount - 1) * DECK_SLOT}px` }
                                : undefined
                        }
                    >
                        {deckEnabled &&
                            Array.from({ length: slotCount }, (_, index) => (
                                <span
                                    key={`snap-${index}`}
                                    className="processusDeckSnap"
                                    style={{ top: `${index * DECK_SLOT}px` }}
                                />
                            ))}

                        <div
                            className="processusDeckViewport"
                            style={
                                deckEnabled
                                    ? ({
                                          top: `${deckHeight / 2}px`,
                                          "--deck-height": `${deckHeight}px`,
                                          // Une etape ne prend jamais tout le
                                          // cadre : ses voisines doivent depasser.
                                          "--deck-card-max": `${Math.max(240, Math.round(deckHeight * 0.72))}px`,
                                      } as CSSProperties)
                                    : undefined
                            }
                        >
                            {/*
                              * Rail des sections, le plus a gauche : l'echelle la plus
                              * large. La bille porte la lettre de sa section, ce qui lui
                              * evite une colonne de libelles supplementaire.
                              */}
                            {deckEnabled && sectionMarks.length > 0 && (
                                <nav className="processusDeckSectionRail" aria-label="Sections du processus">
                                    <span
                                        className="processusDeckRailLine"
                                        aria-hidden="true"
                                        style={{
                                            top: `${(-railHeight / 2).toFixed(1)}px`,
                                            height: `${railHeight.toFixed(1)}px`,
                                        }}
                                    />
                                    {sectionMarks.map((mark, index) => {
                                        const isActive = index === activeSectionIndex;
                                        const offset =
                                            (railOffsetOf(mark.first - 1) + railOffsetOf(mark.last - 1)) / 2;
                                        const label = `${mark.letter} — ${mark.label}`;

                                        return (
                                            <button
                                                key={`section-${mark.letter}-${index}`}
                                                type="button"
                                                className={`processusSectionDot${
                                                    isActive ? " processusSectionDot--active" : ""
                                                }`}
                                                style={{ top: `${offset.toFixed(1)}px` }}
                                                onClick={() => goToPosition(mark.first)}
                                                aria-current={isActive ? "step" : undefined}
                                                aria-label={label}
                                                title={label}
                                            >
                                                {mark.letter}
                                            </button>
                                        );
                                    })}
                                </nav>
                            )}

                            {/*
                              * Rail des phases, entre les sections et les etapes : une
                              * bille par phase, posee en face du groupe d'etapes qu'elle
                              * couvre. Les trois lignes donnent les trois echelles de
                              * lecture du processus sans jamais se melanger.
                              */}
                            {deckEnabled && phaseMarks.length > 0 && (
                                <nav className="processusDeckPhaseRail" aria-label="Phases du processus">
                                    <span
                                        className="processusDeckRailLine"
                                        aria-hidden="true"
                                        style={{
                                            top: `${(-railHeight / 2).toFixed(1)}px`,
                                            height: `${railHeight.toFixed(1)}px`,
                                        }}
                                    />
                                    {phaseMarks.map((mark) => {
                                        const isActive = mark.index === activePhaseIndex;
                                        const offset =
                                            (railOffsetOf(mark.first - 1) + railOffsetOf(mark.last - 1)) / 2;
                                        const label = `${mark.key} — ${mark.label}`;

                                        return (
                                            <button
                                                key={`phase-${mark.key}-${mark.index}`}
                                                type="button"
                                                className={`processusPhaseDot${
                                                    isActive ? " processusPhaseDot--active" : ""
                                                }`}
                                                style={{ top: `${offset.toFixed(1)}px` }}
                                                onClick={() => goToPosition(mark.first)}
                                                aria-current={isActive ? "step" : undefined}
                                                aria-label={label}
                                                title={label}
                                            >
                                                {/* La phase posee est nommee, les autres gardent leur code. */}
                                                <span
                                                    className={`processusPhaseDotTag${
                                                        isActive ? " processusPhaseDotTag--active" : ""
                                                    }`}
                                                >
                                                    {isActive ? mark.label : mark.key}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </nav>
                            )}

                            {/*
                              * Rail des etapes : une bille par etape, toutes identiques.
                              * Le defilement n'y deplace rien, il ne fait qu'y avancer le
                              * repere courant — seul ecart de traitement, avec le nom de
                              * l'etape posee.
                              */}
                            {deckEnabled && (
                                <nav className="processusDeckRail" aria-label="Étapes du processus">
                                    <span
                                        className="processusDeckRailLine"
                                        aria-hidden="true"
                                        style={{
                                            top: `${(-railHeight / 2).toFixed(1)}px`,
                                            height: `${railHeight.toFixed(1)}px`,
                                        }}
                                    />
                                    {Array.from({ length: slotCount }, (_, index) => {
                                        const position = index + 1;
                                        const step = timeline[position - 1];
                                        const isActive = position === activePosition;

                                        const label = step
                                            ? `${step.code} — ${step.name}`
                                            : "Fin du processus";

                                        return (
                                            <button
                                                key={`dot-${position}`}
                                                type="button"
                                                className={`processusDeckDot${
                                                    isActive ? " processusDeckDot--active" : ""
                                                }`}
                                                style={{ top: `${railOffsetOf(index).toFixed(1)}px` }}
                                                onClick={() => goToPosition(position)}
                                                aria-current={isActive ? "step" : undefined}
                                                aria-label={label}
                                                title={label}
                                            >
                                                {/* Seule l'etape posee est nommee : le rail reste lisible. */}
                                                {isActive && (
                                                    <span className="processusDeckDotTag">
                                                        {step ? step.name : "Fin du processus"}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </nav>
                            )}

                            {phases.map((phase, phaseIndex) => (
                                <Fragment key={`${phase.key}-${phaseIndex}`}>
                                    {/*
                                      * En liste (ecran etroit) il n'y a pas de rail :
                                      * le repere de phase revient dans le flux.
                                      */}
                                    {!deckEnabled && (
                                        <p className="processusPhaseMark">
                                            <span className="processusPhaseMarkKey">{phase.key}</span>
                                            {phase.label}
                                        </p>
                                    )}

                                    {phase.steps.map(({ step, position }) => {
                                    const isCurrent = position === currentPosition;

                                    return (
                                        <div
                                            key={`${step.code}-${position}`}
                                            className={`processusDeckCard${
                                                position === activePosition ? " processusDeckCard--active" : ""
                                            }`}
                                            data-position={position}
                                            ref={registerCard(position)}
                                        >
                                            <StepCard
                                                step={step}
                                                position={position}
                                                isCurrent={isCurrent}
                                                isActive={position === activePosition}
                                                chosenLabel={choices[step.code]}
                                            >
                                                {isCurrent && result?.Status === "Draft" && (
                                                    <DecisionPanel
                                                        question={result.question}
                                                        busy={busy === "answer"}
                                                        onChoose={(option) => handleChoose(result.question, option)}
                                                    />
                                                )}
                                                {isCurrent && result?.Status === "WaitingForSend" && (
                                                    <SendPanel
                                                        step={result.sendStep}
                                                        busy={busy === "send"}
                                                        onSend={(payload) => handleSend(result.sendStep, payload)}
                                                    />
                                                )}
                                            </StepCard>

                                            {step.endPhase && (
                                                <p className="processusBoundary">
                                                    {step.endSection ? "Fin de section" : "Fin de phase"}
                                                </p>
                                            )}
                                        </div>
                                    );
                                    })}
                                </Fragment>
                            ))}

                            {/* La fin de processus occupe le dernier cran de la course. */}
                            {doneResult && (
                                <div
                                    className={`processusDeckCard${
                                        slotCount === activePosition ? " processusDeckCard--active" : ""
                                    }`}
                                    data-position={slotCount}
                                    ref={registerCard(slotCount)}
                                >
                                    <section className="processusDone">
                                        <h2 className="processusDoneTitle">Processus complet</h2>
                                        <p className="processusDoneText">
                                            {timeline.length} étapes assemblées pour {doneResult.process.code}.
                                        </p>
                                        <p className="processusDoneText">
                                            Coût total estimé : {formatPrice(doneResult.process.price ?? stats.price)}
                                        </p>
                                    </section>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {asideInfo}
        </div>
    );
}

export default ProcessusPage;
