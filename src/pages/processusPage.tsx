import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
    /** Etapes montees, par position : sert au defilement et a l'observation. */
    const stepRefs = useRef(new Map<number, HTMLElement>());
    const stepsScrollRef = useRef<HTMLDivElement>(null);
    /** Etape sur laquelle le defilement est actuellement pose. */
    const [activePosition, setActivePosition] = useState(1);
    /** Criteres deja lances : garde-fou contre le double effet de StrictMode. */
    const autoStartedFor = useRef("");

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

    /**
     * L'etape "active" est celle qui traverse la bande centrale du defilement.
     * Elle pilote la grosse bille de gauche et la position dans la barre de phases.
     */
    useEffect(() => {
        if (timeline.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const crossing = entries.filter((entry) => entry.isIntersecting);
                if (crossing.length === 0) return;

                const nearest = crossing.reduce((best, entry) =>
                    entry.intersectionRatio >= best.intersectionRatio ? entry : best);
                const position = Number((nearest.target as HTMLElement).dataset.position);

                if (Number.isFinite(position)) setActivePosition(position);
            },
            // Bande etroite au centre de la fenetre : une seule etape est active.
            // On observe la fenetre (et non la colonne) pour que la barre de
            // phases suive aussi en mise en page etroite, ou la page defile.
            { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
        );

        stepRefs.current.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [timeline]);

    const isCreated = result?.Status === "Created";

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

    const activePhaseIndex = useMemo(() => {
        const index = phases.findIndex((phase) => phase.steps.some((entry) => entry.position === activePosition));
        return index < 0 ? 0 : index;
    }, [phases, activePosition]);

    // On defile jusqu'a l'etape en attente des qu'une nouvelle apparait.
    useEffect(() => {
        if (currentPosition < 1) return;
        stepRefs.current.get(currentPosition)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [currentPosition, timeline.length]);

    const goToPhase = (index: number) => {
        const first = phases[index]?.steps[0];
        if (first) stepRefs.current.get(first.position)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const statusLabel = !result
        ? mode === "review"
            ? "Consultation"
            : "Nouveau"
        : result.Status === "Created"
          ? "Processus complet"
          : result.Status === "WaitingForSend"
            ? "En attente d'envoi"
            : "En attente d'une décision";

    return (
        <div id="processusPage">
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

                    <div className="processusRailActions">
                        <Link to="/" className="processusGhostButton processusLinkButton">
                            {portraitEntries ? "Changer les critères" : "Choisir les critères"}
                        </Link>
                        {urlCriteria && (
                            <button
                                type="button"
                                className="processusPrimaryButton"
                                onClick={() => startBuild(urlCriteria)}
                                disabled={busy !== ""}
                            >
                                {busy === "start" ? "Assemblage…" : "Relancer ►"}
                            </button>
                        )}
                    </div>
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

            <main className="processusStage">
                <header className="processusStageHead">
                    <div>
                        <p className="processusStageEyebrow">Processus</p>
                        <h1 className="processusStageTitle">{processCode || "Aucun processus en cours"}</h1>
                    </div>
                    <span
                        className={`processusStatus processusStatus--${
                            isCreated ? "done" : result ? "waiting" : "idle"
                        }`}
                    >
                        {statusLabel}
                    </span>
                </header>

                {error && (
                    <p className="processusError" role="alert">
                        {error}
                    </p>
                )}

                {mode === "review" && timeline.length > 0 && (
                    <p className="processusNotice">
                        Consultation d'un processus enregistré. Pour en construire un nouveau, repassez par les
                        critères de la page d'accueil.
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

                {phases.length > 0 && (
                    <nav className="processusPhaseRail" aria-label="Phases du processus">
                        <div className="processusPhaseHead">
                            <span className="processusPhaseCounter">
                                Phase {activePhaseIndex + 1} / {phases.length}
                            </span>
                            <span className="processusPhaseName">{phases[activePhaseIndex]?.label}</span>
                        </div>

                        <ol className="processusPhaseTrack">
                            {phases.map((phase, index) => (
                                <li key={phase.key} className="processusPhaseNode">
                                    <button
                                        type="button"
                                        className={`processusPhaseBall${
                                            index < activePhaseIndex
                                                ? " processusPhaseBall--done"
                                                : index === activePhaseIndex
                                                  ? " processusPhaseBall--active"
                                                  : ""
                                        }`}
                                        onClick={() => goToPhase(index)}
                                        aria-current={index === activePhaseIndex ? "step" : undefined}
                                        aria-label={`${phase.key} — ${phase.label}`}
                                        title={phase.label}
                                    >
                                        <span className="processusPhaseDotWrap">
                                            <span className="processusPhaseDot" />
                                        </span>
                                        <span className="processusPhaseKey">{phase.key}</span>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    </nav>
                )}

                <div className="processusSteps" ref={stepsScrollRef}>
                    {/* Le filet vertical continu appartient a la piste, pas aux cartes. */}
                    <div className="processusTrack">
                    {phases.map((phase) =>
                        phase.steps.map(({ step, position }) => {
                            const isCurrent = position === currentPosition;

                            return (
                                <div
                                    key={`${step.code}-${position}`}
                                    className="processusStepSnap"
                                    data-position={position}
                                    ref={(element) => {
                                        if (element) stepRefs.current.set(position, element);
                                        else stepRefs.current.delete(position);
                                    }}
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
                        }),
                    )}
                    </div>

                    {isCreated && result.Status === "Created" && (
                        <section className="processusDone">
                            <h2 className="processusDoneTitle">Processus complet</h2>
                            <p className="processusDoneText">
                                {timeline.length} étapes assemblées pour {result.process.code}.
                            </p>
                            <p className="processusDoneText">
                                Coût total estimé : {formatPrice(result.process.price ?? stats.price)}
                            </p>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}

export default ProcessusPage;
