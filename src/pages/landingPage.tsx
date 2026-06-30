import { useEffect, useState } from "react";
import {
    getCountries,
    getIncoterms,
    type Country,
    type Incoterm,
} from "../services/catalog";
import '../styles/pages/landingPage.css'

/**
 * Page d'accueil.
 *
 * Charge les données de référence (pays, incoterms) depuis la PlateformeSVO et
 * alimente les listes déroulantes. La marchandise n'est pas encore disponible
 * côté API : son menu reste désactivé. Le bouton « Simuler » n'est actif que
 * lorsque les champs requis sont sélectionnés.
 */
function LandingPage() {
    // Périmètre de simulation : exportateurs et importateurs sont des listes
    // distinctes (restreintes côté API), d'où deux états séparés.
    const [exporters, setExporters] = useState<Country[]>([]);
    const [importers, setImporters] = useState<Country[]>([]);
    const [incoterms, setIncoterms] = useState<Incoterm[]>([]);
    const [loadError, setLoadError] = useState("");

    // Sélections de l'utilisateur (code du pays / de l'incoterm, "" = aucune).
    const [exporter, setExporter] = useState("");
    const [importer, setImporter] = useState("");
    const [incoterm, setIncoterm] = useState("");

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            getCountries("exporter"),
            getCountries("importer"),
            getIncoterms(),
        ])
            .then(([exporterList, importerList, incotermList]) => {
                if (cancelled) return;
                setExporters(exporterList);
                setImporters(importerList);
                setIncoterms(incotermList);
            })
            .catch(() => {
                if (!cancelled) setLoadError("Impossible de charger les données.");
            });

        return () => { cancelled = true; };
    }, []);

    const canSimulate = exporter !== "" && importer !== "" && incoterm !== "";

    const handleSimulate = () => {
        // TODO: brancher sur la simulation de processus une fois l'API prête.
        alert(`Export: ${exporter} | Import: ${importer} | Incoterm: ${incoterm}`);
    };

    return (
        <div id="langingPage">
            <div className="landingFilters">
                <label className="landingFilter">
                    <span className="landingFilterLabel">Marchandise</span>
                    <select className="landingFilterSelect" defaultValue="" disabled>
                        <option value="" disabled>Bientôt disponible…</option>
                    </select>
                </label>

                <label className="landingFilter">
                    <span className="landingFilterLabel">Pays Exportateur</span>
                    <select
                        className="landingFilterSelect"
                        value={exporter}
                        onChange={(e) => setExporter(e.target.value)}
                    >
                        <option value="" disabled>Sélectionner…</option>
                        {exporters.map((c) => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                    </select>
                </label>

                <label className="landingFilter">
                    <span className="landingFilterLabel">Pays Importateur</span>
                    <select
                        className="landingFilterSelect"
                        value={importer}
                        onChange={(e) => setImporter(e.target.value)}
                    >
                        <option value="" disabled>Sélectionner…</option>
                        {importers.map((c) => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                    </select>
                </label>

                <label className="landingFilter">
                    <span className="landingFilterLabel">Incoterm</span>
                    <select
                        className="landingFilterSelect"
                        value={incoterm}
                        onChange={(e) => setIncoterm(e.target.value)}
                    >
                        <option value="" disabled>Sélectionner…</option>
                        {incoterms.map((i) => (
                            <option key={i.code} value={i.code}>
                                {i.code} — {i.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {loadError && <p className="landingError">{loadError}</p>}

            <button
                className="landingSimulateButton"
                onClick={handleSimulate}
                disabled={!canSimulate}
            >
                Simuler
            </button>
        </div>
    );
}

export default LandingPage;
