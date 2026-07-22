/**
 * Service du chatbot legislation.
 *
 * Le service est volontairement sans etat cote serveur : chaque appel envoie
 * une question complete et recoit une reponse. Il n'y a pas de session a gerer,
 * pas de cookie, pas d'identifiant de conversation. L'historique affiche dans
 * l'interface vit uniquement dans le composant React, donc chaque navigateur a
 * naturellement le sien.
 */

const LEGISLATION_API_URL =
    import.meta.env.VITE_LEGISLATION_API_URL ?? "http://localhost:8000";

/**
 * Pose une question a l'assistant et renvoie sa reponse.
 *
 *
 * Version streamée : appelle onChunk a chaque morceau de texte recu, ce qui
 * permet d'afficher la reponse pendant qu'elle s'ecrit.
 *
 * Le serveur repond en SSE : des lignes "data: {json}", separees par une ligne
 * vide, et un "data: [DONE]" final.
 */
export async function askQuestionStream(
    prompt: string,
    onChunk: (text: string) => void,
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(`${LEGISLATION_API_URL}/api/v1/legislation/generate/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });
    } catch {
        throw new Error("Impossible de joindre l'assistant.");
    }

    if (!response.ok || !response.body) {
        throw new Error(`Erreur serveur (${response.status}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // Un chunk reseau ne s'aligne pas sur les evenements SSE : on garde le
    // reliquat incomplet jusqu'a l'arrivee du morceau suivant.
    let buffer = "";

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (payload === "[DONE]") return;

            const data = JSON.parse(payload) as { text?: string; error?: string };
            if (data.error) throw new Error(data.error);
            if (data.text) onChunk(data.text);
        }
    }
}

export async function askQuestion(prompt: string): Promise<string> {
    let response: Response;
    try {
        response = await fetch(`${LEGISLATION_API_URL}/api/v1/legislation/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });
    } catch {
        throw new Error("Impossible de joindre l'assistant.");
    }

    if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status}).`);
    }

    const data = (await response.json()) as { answer?: unknown };
    if (typeof data.answer !== "string") {
        throw new Error("Reponse invalide de l'assistant.");
    }

    return data.answer;
}
