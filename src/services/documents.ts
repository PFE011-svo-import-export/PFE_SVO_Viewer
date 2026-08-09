import { authFetch } from "./auth";

export const MAXIMUM_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx";

export interface UploadedStepDocument {
    id: number;
    fileName: string;
    contentType: string;
    size: number;
    insertDate: string;
    downloadUrl: string;
}

function pathFor(processId: number, stepCode: string): string {
    return `/process/${processId}/steps/${encodeURIComponent(stepCode)}/documents`;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const body = await response.json() as Record<string, unknown>;
        const message = body.message ?? body.detail ?? body.title;
        if (typeof message === "string" && message.length > 0) return message;

        const errors = body.errors as Record<string, string[]> | undefined;
        const first = errors && Object.values(errors).flat().find(Boolean);
        if (first) return first;
    } catch {
        // Le message de repli reste plus utile qu'un corps non JSON.
    }
    return fallback;
}

async function checked(response: Response, fallback: string): Promise<Response> {
    if (!response.ok) throw new Error(await errorMessage(response, fallback));
    return response;
}

export async function listStepDocuments(processId: number, stepCode: string): Promise<UploadedStepDocument[]> {
    const response = await authFetch(pathFor(processId, stepCode), { method: "GET" });
    await checked(response, "Impossible de charger les documents.");
    return await response.json() as UploadedStepDocument[];
}

export async function uploadStepDocument(
    processId: number,
    stepCode: string,
    file: File,
): Promise<UploadedStepDocument> {
    const form = new FormData();
    form.append("file", file);
    const response = await authFetch(pathFor(processId, stepCode), { method: "POST", body: form });
    await checked(response, "L'insertion du document a échoué.");
    return await response.json() as UploadedStepDocument;
}

export async function deleteStepDocument(
    processId: number,
    stepCode: string,
    documentId: number,
): Promise<void> {
    const response = await authFetch(`${pathFor(processId, stepCode)}/${documentId}`, { method: "DELETE" });
    await checked(response, "La suppression du document a échoué.");
}

export async function downloadStepDocument(
    processId: number,
    stepCode: string,
    document: UploadedStepDocument,
): Promise<void> {
    const response = await authFetch(`${pathFor(processId, stepCode)}/${document.id}`, { method: "GET" });
    await checked(response, "Le téléchargement du document a échoué.");

    const url = URL.createObjectURL(await response.blob());
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.fileName;
    link.click();
    URL.revokeObjectURL(url);
}
