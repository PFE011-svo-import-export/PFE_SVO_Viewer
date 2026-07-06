
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

/** Marchandise renvoyée par GET /merchandise/catalog (cf. MerchandiseDto). */
export interface Merchandise {
    codeSH: string;
    name: string;
    description: string;
    quantityType: string;
    priceType: string;
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

export function getMerchandise(): Promise<Merchandise[]> {
    return getJson<Merchandise[]>("/merchandise/catalog");
}