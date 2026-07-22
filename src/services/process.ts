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