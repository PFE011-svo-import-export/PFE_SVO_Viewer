/**
 * Service du catalogue d'etapes (table Steps).
 *
 * Ce catalogue est le gabarit dont les processus sont tires : une etape y decrit
 * un maillon et ses successeurs possibles. Miroir du StepController.
 *
 * Deux particularites du backend a garder en tete :
 *  - les DTO sont polymorphes, discriminant "Type" (PascalCase) : Standard,
 *    Question, Rag, Send. Le discriminant n'est pas toujours ecrit dans la
 *    reponse, d'ou la normalisation ci-dessous ;
 *  - la creation est exposee sur /step (route absolue), pas /steps.
 */

import { authFetch } from "./auth";

/** Les quatre variantes d'etape (cf. [JsonDerivedType] sur StepDto). */
export const STEP_TYPES = ["Standard", "Question", "Rag", "Send"] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Routes du service de legislation interrogeables par une etape RAG. */
export const LEGISLATION_ROUTES = ["tarifs", "requirements"] as const;
export type LegislationRoute = (typeof LEGISLATION_ROUTES)[number];

/** Champs communs a toutes les etapes (cf. StepDto). */
export interface TemplateStep {
    type: StepType;
    code: string;
    name: string;
    description: string | null;
    /** Calcule par le backend, jamais saisi ici. */
    price: number;
    endPhase: boolean;
    endSection: boolean;
    definitionOfDone: string;
    informationSource: string | null;
    originalSource: string | null;
    status: string;
    /** Question posee — uniquement sur les etapes Question et Rag. */
    question: string | null;
    /** Route de legislation — uniquement sur les etapes Rag. */
    legislationURLRoute: LegislationRoute | null;
    /** Codes des successeurs declares (cf. StepDto.PossibleNextStepCodes). */
    possibleNextStepCodes: string[];
}

/** Saisie du formulaire : le meme objet sert a creer et a modifier. */
export interface StepInput {
    type: StepType;
    /** Ignore en modification : le code identifie l'etape et n'est pas modifiable. */
    code: string;
    name: string;
    description: string;
    endPhase: boolean;
    endSection: boolean;
    definitionOfDone: string;
    informationSource: string;
    originalSource: string;
    question: string;
    legislationURLRoute: LegislationRoute;
    possibleNextSteps: string[];
    previousSteps: string[];
}

/** Erreur portant un message deja lisible par l'utilisateur. */
export class StepServiceError extends Error {}

type RawStep = Record<string, unknown>;

/**
 * Deduit le type d'une etape quand le discriminant manque.
 *
 * Le backend n'ecrit "Type" que lorsqu'il serialise via le type de base ; une
 * etape renvoyee au premier niveau (GET /steps/{code}) sort avec son type
 * concret, donc sans discriminant. On le reconstruit par la forme du payload :
 * meme heuristique que dans process.ts.
 */
function inferType(raw: RawStep): StepType {
    // Seule la variante Question porte le graphe imbrique.
    if (Array.isArray(raw.possibleNextSteps)) return "Question";
    if (typeof raw.legislationURLRoute === "string") return "Rag";
    if ("sentItem" in raw || "professional" in raw) return "Send";
    if (typeof raw.question === "string") return "Rag";
    return "Standard";
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function asCodeList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((code): code is string => typeof code === "string" && code.length > 0)
        : [];
}

function normalize(raw: RawStep): TemplateStep {
    const route = asString(raw.legislationURLRoute);

    return {
        type: typeof raw.Type === "string" ? (raw.Type as StepType) : inferType(raw),
        code: String(raw.code ?? ""),
        name: String(raw.name ?? ""),
        description: asString(raw.description),
        price: typeof raw.price === "number" ? raw.price : 0,
        endPhase: raw.endPhase === true,
        endSection: raw.endSection === true,
        definitionOfDone: String(raw.definitionOfDone ?? ""),
        informationSource: asString(raw.informationSource),
        originalSource: asString(raw.originalSource),
        status: String(raw.status ?? ""),
        question: asString(raw.question),
        legislationURLRoute: LEGISLATION_ROUTES.includes(route as LegislationRoute)
            ? (route as LegislationRoute)
            : null,
        possibleNextStepCodes: asCodeList(raw.possibleNextStepCodes),
    };
}

/**
 * Predecesseurs deduits du catalogue : X precede Y si Y figure parmi ses
 * successeurs. Le backend n'expose pas la relation inverse, et la calculer ici
 * evite un aller-retour par etape.
 */
export function findPreviousStepCodes(steps: TemplateStep[], code: string): string[] {
    return steps
        .filter((step) => step.possibleNextStepCodes.includes(code))
        .map((step) => step.code);
}

/**
 * Traduit un corps d'erreur en une phrase affichable.
 *
 * Le controleur repond tantot une chaine brute (BadRequest(ex.Message),
 * Conflict(ex.Message)), tantot un ProblemDetails.
 */
async function readError(response: Response, fallback: string): Promise<string> {
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
        if (typeof parsed === "string") return parsed;
    } catch {
        // Corps non JSON : message brut renvoye par le controleur.
        const firstLine = body.split("\n")[0].trim();
        if (firstLine.length > 0 && firstLine.length <= 300 && !firstLine.startsWith("<")) {
            return firstLine;
        }
    }

    return fallback;
}

async function send(path: string, options: RequestInit, fallback: string): Promise<Response> {
    let response: Response;
    try {
        response = await authFetch(path, options);
    } catch {
        throw new StepServiceError("Impossible de joindre le serveur.");
    }

    if (!response.ok) {
        throw new StepServiceError(await readError(response, fallback));
    }

    return response;
}

/**
 * Corps envoye au backend. Les DTO de creation et de modification different sur
 * deux points : le code (present a la creation seulement) et la casse de
 * `legislationURLRoute`. On produit donc chaque forme telle qu'elle est declaree.
 */
function toPayload(input: StepInput, mode: "create" | "update"): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        Type: input.type,
        name: input.name.trim(),
        possibleNextSteps: input.possibleNextSteps,
        previousSteps: input.previousSteps,
        description: input.description.trim() === "" ? null : input.description.trim(),
        endPhase: input.endPhase,
        endSection: input.endSection,
        definitionOfDone: input.definitionOfDone.trim(),
        informationSource: input.informationSource.trim() === "" ? null : input.informationSource.trim(),
        originalSource: input.originalSource.trim() === "" ? null : input.originalSource.trim(),
    };

    if (mode === "create") payload.code = input.code.trim();

    if (input.type === "Question") {
        payload.question = input.question.trim();
    }

    if (input.type === "Rag") {
        payload.question = input.question.trim();
        // CreateRagStepDto declare `legislationURLRoute`, UpdateRagStepDto
        // `LegislationURLRoute` : la liaison est insensible a la casse, mais on
        // colle a la declaration de chacun.
        if (mode === "create") {
            payload.legislationURLRoute = input.legislationURLRoute;
            // Present dans le record de creation, non utilise par le service.
            payload.ragResponse = "";
        } else {
            payload.LegislationURLRoute = input.legislationURLRoute;
        }
    }

    return payload;
}

/**
 * GET /steps/template — le catalogue.
 * Le backend ne renvoie ici que les etapes non rattachees a un processus
 * (NextStepId null), c'est-a-dire le gabarit.
 */
export async function getTemplateSteps(): Promise<TemplateStep[]> {
    const response = await send("/steps/template", { method: "GET" }, "Impossible de charger les etapes.");
    const raw = (await response.json()) as RawStep[];
    return raw.map(normalize).sort((a, b) => a.code.localeCompare(b.code));
}

/** GET /steps/{code} — detail d'une etape. */
export async function getStep(code: string): Promise<TemplateStep> {
    const response = await send(
        `/steps/${encodeURIComponent(code)}`,
        { method: "GET" },
        "Impossible de charger l'etape.",
    );
    return normalize((await response.json()) as RawStep);
}

/** POST /step — creation (route absolue cote backend, sans le "s"). */
export async function createStep(input: StepInput): Promise<void> {
    await send(
        "/step",
        { method: "POST", body: JSON.stringify(toPayload(input, "create")) },
        "La creation de l'etape a echoue.",
    );
}

/** PUT /steps/{code} — modification. Le type ne peut pas changer. */
export async function updateStep(code: string, input: StepInput): Promise<void> {
    await send(
        `/steps/${encodeURIComponent(code)}`,
        { method: "PUT", body: JSON.stringify(toPayload(input, "update")) },
        "La mise a jour de l'etape a echoue.",
    );
}

/** DELETE /steps/{code} — 409 quand l'etape est encore referencee. */
export async function deleteStep(code: string): Promise<void> {
    await send(
        `/steps/${encodeURIComponent(code)}`,
        { method: "DELETE" },
        "La suppression de l'etape a echoue.",
    );
}
