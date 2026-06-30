/**
 * Service de catalogue (données de référence).
 *
 * Parle aux endpoints publics de la PlateformeSVO (/countries, /incoterms) qui
 * alimentent les listes déroulantes de la page d'accueil. Lecture seule, pas de
 * token requis — on utilise donc fetch directement (pas authFetch).
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5294";

/** Pays renvoyé par GET /countries (cf. CountryDto). */
export interface Country {
    code: string;
    name: string;
    currency: string;
    region: string;
}

/** Incoterm renvoyé par GET /incoterms (cf. IncotermDto). */
export interface Incoterm {
    code: string;
    name: string;
    description: string;
}

async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`);
    if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status}) sur ${path}.`);
    }
    return (await response.json()) as T;
}

/** Rôle d'un pays dans une simulation (restreint le périmètre côté API). */
export type CountryRole = "exporter" | "importer";

export function getCountries(role?: CountryRole): Promise<Country[]> {
    const path = role ? `/countries?role=${role}` : "/countries";
    return getJson<Country[]>(path);
}

export function getIncoterms(): Promise<Incoterm[]> {
    return getJson<Incoterm[]>("/incoterms");
}
