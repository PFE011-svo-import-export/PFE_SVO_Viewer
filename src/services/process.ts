const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5294";

export interface Process{

}

export interface Section{

}

export interface Phase{

}

export interface Step{

}

export interface Portrait{
    codeSH: string;
    departure: string;
    arrival: string;
    Incoterm: string;
}

async function postJson<T>(path: string): Promise<T>{
    const url = `${API_URL}${path}`;
    const response = await fetch(`${url}`);
    console.log(`From process.GetJson(path) ${url}`);
    console.log(response);
    if (!response.ok){
        throw new Error(`Erreur serveur (${response.status}) sur ${path}.`);
    }
    return (await response.json()) as T;
}
export function postProcess(portrait: Portrait){
    const portraitCode = `${portrait.codeSH}${portrait.departure}${portrait.arrival}${portrait.Incoterm}`;
    const path = `/process?portrait=${portraitCode}`;
    return postJson<Process>(path);
}