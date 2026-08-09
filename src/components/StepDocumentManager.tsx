import { useEffect, useRef, useState } from "react";
import {
    ACCEPTED_DOCUMENT_TYPES,
    MAXIMUM_DOCUMENT_SIZE,
    deleteStepDocument,
    downloadStepDocument,
    listStepDocuments,
    uploadStepDocument,
    type UploadedStepDocument,
} from "../services/documents";

// Selection metier initiale. Ajouter ou retirer un code ici suffit pour faire
// apparaitre l'option sur une autre etape du viewer.
export const DOCUMENT_UPLOAD_STEP_CODES = new Set([
    "A-1.31",
    "A-1.32",
    "A-3.10",
    "A-3.30",
    "A-3.50",
]);

export function allowsDocumentUpload(stepCode: string): boolean {
    return DOCUMENT_UPLOAD_STEP_CODES.has(stepCode.toUpperCase());
}

function formatSize(size: number): string {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
    return `${(size / (1024 * 1024)).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} Mo`;
}

export default function StepDocumentManager({
    processId,
    stepCode,
}: {
    processId: number | null;
    stepCode: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [documents, setDocuments] = useState<UploadedStepDocument[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (processId === null) {
            setDocuments([]);
            return;
        }

        let cancelled = false;
        setError("");
        listStepDocuments(processId, stepCode)
            .then((items) => { if (!cancelled) setDocuments(items); })
            .catch((caught) => {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
            });
        return () => { cancelled = true; };
    }, [processId, stepCode]);

    const handleFile = async (file: File | undefined) => {
        if (!file || processId === null) return;
        if (file.size > MAXIMUM_DOCUMENT_SIZE) {
            setError("Le fichier dépasse la taille maximale de 10 Mo.");
            return;
        }

        setBusy(true);
        setError("");
        try {
            const inserted = await uploadStepDocument(processId, stepCode, file);
            setDocuments((current) => [inserted, ...current]);
            if (inputRef.current) inputRef.current.value = "";
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (document: UploadedStepDocument) => {
        if (processId === null) return;
        setBusy(true);
        setError("");
        try {
            await deleteStepDocument(processId, stepCode, document.id);
            setDocuments((current) => current.filter((item) => item.id !== document.id));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
        } finally {
            setBusy(false);
        }
    };

    const handleDownload = async (document: UploadedStepDocument) => {
        if (processId === null) return;
        setError("");
        try {
            await downloadStepDocument(processId, stepCode, document);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
        }
    };

    return (
        <section className="processusUpload" aria-label="Documents insérés">
            <div className="processusUploadHead">
                <div>
                    <span className="processusDocumentsLabel">Documents insérés</span>
                    <p className="processusUploadHint">PDF, image, Word ou Excel · 10 Mo maximum</p>
                </div>
                <label className={`processusUploadButton${processId === null || busy ? " processusUploadButton--disabled" : ""}`}>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={ACCEPTED_DOCUMENT_TYPES}
                        disabled={processId === null || busy}
                        onChange={(event) => void handleFile(event.target.files?.[0])}
                    />
                    {busy ? "Traitement…" : "Insérer un document"}
                </label>
            </div>

            {processId === null && (
                <p className="processusUploadNotice">
                    L'insertion sera disponible lorsque le processus sera terminé et enregistré.
                </p>
            )}
            {error && <p className="processusUploadError" role="alert">{error}</p>}

            {documents.length > 0 && (
                <ul className="processusUploadList">
                    {documents.map((document) => (
                        <li key={document.id}>
                            <span className="processusDocumentIcon" aria-hidden="true">▤</span>
                            <span className="processusUploadFile">
                                <strong>{document.fileName}</strong>
                                <small>{formatSize(document.size)}</small>
                            </span>
                            <button type="button" onClick={() => void handleDownload(document)} disabled={busy}>
                                Télécharger
                            </button>
                            <button type="button" onClick={() => void handleDelete(document)} disabled={busy}>
                                Supprimer
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
