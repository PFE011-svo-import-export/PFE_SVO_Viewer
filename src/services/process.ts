import { authFetch } from "./auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5294";

/** Étape d'une phase (cf. StepDto). */
export interface Step {
    code: string;
    price: number;
    question: string | null;
    description: string | null;
}

/** Phase d'une section (cf. PhaseDto). */
export interface Phase {
    code: string;
    price: number;
    steps: Step[];
}

/** Section d'un processus (cf. SectionDto). */
export interface Section {
    code: string;
    sectionName: string;
    isImplicated: boolean;
    price: number;
    phases: Phase[];
}

/** Processus simulé renvoyé par POST /process (cf. ProcessDto). */
export interface Process {
    code: string;
    price: number | null;
    sections: Section[];
}

export interface Portrait{
    codeSH: string;
    departure: string;
    arrival: string;
    Incoterm: string;
}

async function postJson<T>(path: string): Promise<T>{
    const url = `${API_URL}${path}`;
    const response = await fetch(url, { method: "POST" });
    if (!response.ok){
        throw new Error(`Erreur serveur (${response.status}) sur ${path}.`);
    }
    return (await response.json()) as T;
}

export function getProcess(processCode: string){
    return postJson<Process>(`/process/${encodeURIComponent(processCode)}`);
}

export function postProcess(portrait: Portrait){
    const params = new URLSearchParams({
        codeSH: portrait.codeSH,
        departure: portrait.departure,
        arrival: portrait.arrival,
        incoterm: portrait.Incoterm,
    });
    return postJson<Process>(`/process?${params.toString()}`);
}

/* ------------------------------------------------------------------ *
 *  Construction pas a pas d'un processus (POST /process/build/...)
 *
 *  Le backend deroule le graphe d'etapes tant qu'il peut decider seul.
 *  Il s'arrete (et renvoie la main au viewer) sur deux cas :
 *   - une QuestionStep : c'est a l'utilisateur de choisir la suite;
 *   - une SendStep     : un courriel doit partir avant de continuer.
 * ------------------------------------------------------------------ */

/** Statut d'une etape (cf. Domain.StepStatus). */
export type StepState = "Done" | "Current" | "ToDo" | "Incomplete";

/** Document produit ou référencé par une étape (cf. DocumentSummaryDto). */
export interface StepDocument {
    name: string;
    content: string | null;
}

interface BuildStepBase {
    code: string;
    name: string;
    description: string | null;
    price: number;
    endPhase: boolean;
    endSection: boolean;
    definitionOfDone: string;
    informationSource: string | null;
    originalSource: string | null;
    status: StepState;
    /** Sources d'une réponse RAG, courriel envoyé, bon de commande généré... */
    documents: StepDocument[];
}

export interface StandardBuildStep extends BuildStepBase {
    Type: "Standard";
}

export interface QuestionBuildStep extends BuildStepBase {
    Type: "Question";
    question: string;
    responseType: string | null;
    responseValue: unknown;
    /** Branches du noeud de decision : c'est ce que l'utilisateur choisit. */
    possibleNextSteps: BuildStep[];
}

export interface RagBuildStep extends BuildStepBase {
    Type: "Rag";
    question: string;
    responseType: string | null;
    responseValue: unknown;
}

export interface SendBuildStep extends BuildStepBase {
    Type: "Send";
    sentItem: { name: string; content: string | null } | null;
    professional: {
        professionalType: string;
        name: string;
        companyName: string;
        address: string;
    } | null;
}

/**
 * Etape polymorphe. Le discriminant est "Type" (PascalCase impose par
 * [JsonPolymorphic] cote backend), les autres champs sont en camelCase.
 */
export type BuildStep = StandardBuildStep | QuestionBuildStep | RagBuildStep | SendBuildStep;

/** Les 4 criteres saisis par l'utilisateur (cf. StartProcessBuildDto). */
export interface ProcessCriteria {
    codeSH: string;
    departureCode: string;
    arrivalCode: string;
    incotermCode: string;
}

export interface ProcessSectionSummary {
    /** Enum serialise en nombre (aucun JsonStringEnumConverter cote backend). */
    name: string | number;
    code: string | number;
    price: number | null;
}

/**
 * Resultat d'un appel de construction (cf. ProcessBuildResultDto).
 * Discriminant "Status" (PascalCase, impose par [JsonPolymorphic]).
 *
 * Tant que la construction n'est pas terminee le processus n'existe qu'en
 * memoire cote backend : il n'a pas d'`processId` (seul `buildId` l'identifie)
 * et la chronologie voyage dans `assembledSteps`.
 */
interface BuildResultBase {
    buildId: string;
    processCode: string;
    assembledSteps: BuildStep[];
}

export type ProcessBuildResult =
    | (BuildResultBase & { Status: "Draft"; question: QuestionBuildStep })
    | (BuildResultBase & { Status: "WaitingForSend"; sendStep: SendBuildStep })
    | (BuildResultBase & {
        Status: "Created";
        processId: number;
        process: { code: string; price: number | null; sections: ProcessSectionSummary[] };
    });

/** Processus persiste renvoye par GET /process et GET /process/{id}. */
export interface ProcessRecord {
    id: number;
    code: string;
    codeSH: string;
    departurePortCode: string;
    arrivalPortCode: string;
    incotermCode: string;
    price: number;
    status: string;
    /** Tableau JSON serialise des codes d'etapes deja assemblees. */
    assembledStepCodes: string | null;
    pendingStepCode: string | null;
}

/** Requete d'envoi de courriel pour debloquer une SendStep. */
export interface SendStepEmailPayload {
    buildId: string;
    recipientEmail: string;
    subject?: string;
    message?: string;
    productQuantity?: number;
    quantityUnit?: string;
    importantInformation: Record<string, string>;
}

export interface SendStepEmailResult {
    documentId: number;
    stepCode: string;
    recipientEmail: string;
    subject: string;
    sentAt: string;
    pdfUrl: string;
    /** Suite de la construction, une fois le courriel parti. */
    processBuild: ProcessBuildResult | null;
}

/**
 * Code d'un processus = CodeSH.PortDepart.PortArrivee.Incoterm.
 * Reconstruit cote viewer car /process/build/start ne le renvoie pas, alors
 * que /process/build/answer l'exige.
 */
export function buildProcessCode(criteria: ProcessCriteria): string {
    return [
        criteria.codeSH,
        criteria.departureCode,
        criteria.arrivalCode,
        criteria.incotermCode,
    ].join(".");
}

/** `assembledStepCodes` est un tableau JSON serialise en base. */
export function parseAssembledStepCodes(serialized: string | null | undefined): string[] {
    if (!serialized) return [];
    try {
        const parsed = JSON.parse(serialized);
        return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === "string") : [];
    } catch {
        return [];
    }
}

/**
 * Le backend repond soit en ProblemDetails (JSON), soit — pour une exception
 * non geree en Development — en texte brut commencant par le type de
 * l'exception. On remonte la premiere ligne, bien plus parlante que le statut.
 */
async function readError(response: Response, path: string): Promise<string> {
    const fallback = `Erreur serveur (${response.status}) sur ${path}.`;

    let body = "";
    try {
        body = await response.text();
    } catch {
        return fallback;
    }
    if (!body) return fallback;

    try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const detail = parsed.message ?? parsed.detail ?? parsed.title;
        if (typeof detail === "string" && detail.length > 0) return detail;
    } catch {
        // Corps non JSON : trace d'exception ou page d'erreur HTML.
        const firstLine = body.split("\n")[0].trim();
        if (firstLine.length > 0 && firstLine.length <= 300 && !firstLine.startsWith("<")) {
            return firstLine;
        }
    }

    return fallback;
}

type RawStep = Record<string, unknown>;

/** Deduit le type d'une etape a partir des champs propres a chaque variante. */
function inferStepType(raw: RawStep): BuildStep["Type"] {
    if (Array.isArray(raw.possibleNextSteps)) return "Question";
    if (typeof raw.question === "string") return "Rag";
    if ("sentItem" in raw || "professional" in raw) return "Send";
    return "Standard";
}

/**
 * Le discriminant "Type" n'est ecrit que lorsque l'etape est serialisee via le
 * type de base StepDto — c'est le cas des `possibleNextSteps` imbriques, mais
 * pas des etapes renvoyees au premier niveau (`question`, `sendStep`,
 * GET /steps/{code}) que le backend serialise avec leur type concret.
 * On le reconstruit donc a partir de la forme du payload.
 */
function normalizeStep(raw: RawStep): BuildStep {
    const step: RawStep = { ...raw };

    if (!Array.isArray(step.documents)) step.documents = [];

    if (Array.isArray(step.possibleNextSteps)) {
        step.possibleNextSteps = (step.possibleNextSteps as RawStep[]).map(normalizeStep);
    }

    if (typeof step.Type !== "string") {
        step.Type = inferStepType(raw);
    }

    return step as unknown as BuildStep;
}

/** Le contexte donne le type de l'etape en attente : on l'impose. */
function normalizeBuildResult(raw: unknown): ProcessBuildResult {
    const result = { ...(raw as Record<string, unknown>) };

    // `assembledSteps` est serialise via le type de base : le discriminant y est
    // deja present, mais on normalise quand meme par securite.
    result.assembledSteps = Array.isArray(result.assembledSteps)
        ? (result.assembledSteps as RawStep[]).map(normalizeStep)
        : [];

    if (result.Status === "Draft") {
        result.question = { ...normalizeStep(result.question as RawStep), Type: "Question" };
    }

    if (result.Status === "WaitingForSend") {
        result.sendStep = { ...normalizeStep(result.sendStep as RawStep), Type: "Send" };
    }

    return result as unknown as ProcessBuildResult;
}

async function sendJson<T>(path: string, options: RequestInit): Promise<T> {
    const response = await authFetch(path, options);
    if (!response.ok) {
        throw new Error(await readError(response, path));
    }
    return (await response.json()) as T;
}

/** Demarre la construction : deroule le graphe jusqu'au premier arret. */
export async function startProcessBuild(criteria: ProcessCriteria): Promise<ProcessBuildResult> {
    return normalizeBuildResult(
        await sendJson<unknown>("/process/build/start", {
            method: "POST",
            body: JSON.stringify(criteria),
        }),
    );
}

/** Repond au noeud de decision courant et relance le deroulement. */
export async function answerProcessStep(
    buildId: string,
    chosenStepCode: string,
): Promise<ProcessBuildResult> {
    return normalizeBuildResult(
        await sendJson<unknown>("/process/build/answer", {
            method: "POST",
            body: JSON.stringify({ buildId, chosenStepCode }),
        }),
    );
}

/** Envoie le courriel attendu par une SendStep, ce qui debloque la suite. */
export async function sendStepEmail(
    stepCode: string,
    payload: SendStepEmailPayload,
): Promise<SendStepEmailResult> {
    const sent = await sendJson<SendStepEmailResult>(`/process/${encodeURIComponent(stepCode)}/email`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return {
        ...sent,
        processBuild: sent.processBuild ? normalizeBuildResult(sent.processBuild) : null,
    };
}

/** Processus persistes (reserve aux roles CAPD / Admin). */
export function getProcesses(): Promise<ProcessRecord[]> {
    return sendJson<ProcessRecord[]>("/process", { method: "GET" });
}

/** Detail complet d'une etape a partir de son code (GET /steps/{code}). */
export async function getStepByCode(stepCode: string): Promise<BuildStep> {
    const path = `/steps/${encodeURIComponent(stepCode)}`;
    const response = await fetch(`${API_URL}${path}`);
    if (!response.ok) {
        throw new Error(await readError(response, path));
    }
    return normalizeStep((await response.json()) as RawStep);
}
