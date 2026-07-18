import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    getPorts,
    getIncoterms,
    getMerchandise,
    type Port,
    type Incoterm,
    type Merchandise,
} from "../services/catalog";
import {
    postProcess,
    type Portrait
} from "../services/process";
import Footer from "../components/footer/footer";
import '../styles/pages/landingPage.css'

/**
 * Page d'accueil.
 *
 * Charge les données de référence (marchandises, pays, incoterms) depuis la
 * PlateformeSVO et alimente les listes déroulantes. Le bouton « Simuler »
 * n'est actif que lorsque les champs requis sont sélectionnés.
 */
function LandingPage() {
    const navigate = useNavigate();

    // Périmètre de simulation : ports de départ et d'arrivée sont des listes
    // distinctes (restreintes côté API selon le pays exportateur/importateur), d'où deux états séparés.
    const [merchandises, setMerchandises] = useState<Merchandise[]>([]);
    const [departurePorts, setDeparturePorts] = useState<Port[]>([]);
    const [arrivalPorts, setArrivalPorts] = useState<Port[]>([]);
    const [incoterms, setIncoterms] = useState<Incoterm[]>([]);
    const [loadError, setLoadError] = useState("");

    // Sélections de l'utilisateur (code de la marchandise / du port / de l'incoterm, "" = aucune).
    const [merchandise, setMerchandise] = useState("");
    const [departure, setDeparture] = useState("");
    const [arrival, setArrival] = useState("");
    const [incoterm, setIncoterm] = useState("");

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            getMerchandise(),
            getPorts("exporter"),
            getPorts("importer"),
            getIncoterms(),
        ])
            .then(([merchandiseList, departurePortList, arrivalPortList, incotermList]) => {
                if (cancelled) return;
                setMerchandises(merchandiseList);
                setDeparturePorts(departurePortList);
                setArrivalPorts(arrivalPortList);
                setIncoterms(incotermList);
            })
            .catch(() => {
                if (!cancelled) setLoadError("Impossible de charger les données.");
            });

        return () => { cancelled = true; };
    }, []);

    const canSimulate = merchandise !== "" && departure !== "" && arrival !== "" && incoterm !== "";

    const handleSimulate = async () => {
        const portrait: Portrait = {
            codeSH: merchandise,
            departure: departure,
            arrival: arrival,
            Incoterm: incoterm
        };

        try {
            const process = await postProcess(portrait);
            navigate(`/simulation/${process.code}`);
        } catch {
            setLoadError("Impossible de lancer la simulation.");
        }
    };

    return (
        <div id="landingPage">
            <div className="landingFiltersHolder">
                <div className="landingInstruction">INDIQUEZ LES <br /> CRITÈRES DE SIMULATION:</div>
                <div className="landingFilters">
                    <label className="landingFilter">
                        <span className="landingFilterLabel">Marchandise</span>
                        <select
                            className="landingFilterSelect"
                            value={merchandise}
                            onChange={(e) => setMerchandise(e.target.value)}
                        >
                            <option value="" disabled>Sélectionner…</option>
                            {merchandises.map((m) => (
                                <option key={m.codeSH} value={m.codeSH}>{m.name}</option>
                            ))}
                        </select>
                    </label>

                    <label className="landingFilter">
                        <span className="landingFilterLabel">Port de départ</span>
                        <select
                            className="landingFilterSelect"
                            value={departure}
                            onChange={(e) => setDeparture(e.target.value)}
                        >
                            <option value="" disabled>Sélectionner…</option>
                            {departurePorts.map((p) => (
                                <option key={p.code} value={p.code}>{p.name} — {p.city}, {p.country}</option>
                            ))}
                        </select>
                    </label>

                    <label className="landingFilter">
                        <span className="landingFilterLabel">Port d'arrivée</span>
                        <select
                            className="landingFilterSelect"
                            value={arrival}
                            onChange={(e) => setArrival(e.target.value)}
                        >
                            <option value="" disabled>Sélectionner…</option>
                            {arrivalPorts.map((p) => (
                                <option key={p.code} value={p.code}>{p.name} — {p.city}, {p.country}</option>
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
                        <button
                            className="landingSimulateButton"
                            onClick={handleSimulate}
                            disabled={!canSimulate}
                        >
                            Simuler ►
                        </button>
                    </label>
                </div>

                {loadError && <p className="landingError">{loadError}</p>}

            </div>
            <Footer showCarousel />
        </div>
    );
}

export default LandingPage;
