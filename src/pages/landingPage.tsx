import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Select from "@radix-ui/react-select";
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
import ShaderBackground from "../components/shaders/ShaderBackground";
import '../styles/pages/landingPage.css'

/**
 * Un select entièrement stylable (fond transparent inclus), contrairement
 * au <select> natif dont le popup d'options est un widget du système
 * d'exploitation qu'aucun CSS ne peut rendre transparent.
 */
function FilterSelect({
    label,
    placeholder,
    value,
    onValueChange,
    options,
}: {
    label: string;
    placeholder: string;
    value: string;
    onValueChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <label className="landingFilter">
            <span className="landingFilterLabel">{label}</span>
            <Select.Root value={value} onValueChange={onValueChange}>
                <Select.Trigger className="landingFilterSelect">
                    <Select.Value placeholder={placeholder} />
                    <Select.Icon className="landingFilterSelectIcon">▾</Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                    <Select.Content
                        className="landingFilterSelectContent"
                        position="popper"
                        sideOffset={4}
                    >
                        <Select.Viewport>
                            {options.map((o) => (
                                <Select.Item key={o.value} value={o.value} className="landingFilterSelectItem">
                                    <Select.ItemText>{o.label}</Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.Viewport>
                    </Select.Content>
                </Select.Portal>
            </Select.Root>
        </label>
    );
}

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

    // Mirrors fragment.glsl's circle position (center.x = 0) so the button
    // can sit exactly inside the shader-drawn circle. uv.y = 0 always maps
    // to vUv.y = 0.5 (the shader's horizontal symmetry line), but the
    // horizontal position depends on the canvas's own aspect ratio, so it
    // has to be recomputed whenever the window resizes.
    const [circleLeftPercent, setCircleLeftPercent] = useState(90);

    useEffect(() => {
        const updateCirclePosition = () => {
            const canvasWidth = window.innerWidth;
            const canvasHeight = window.innerHeight * 0.55; // .shaderBackground's height: 55%
            const aspect = canvasWidth / canvasHeight;
            const vUvX = 1 - 0.50 / aspect;
            setCircleLeftPercent(vUvX * 100);
        };

        updateCirclePosition();
        window.addEventListener("resize", updateCirclePosition);
        return () => window.removeEventListener("resize", updateCirclePosition);
    }, []);

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
            <ShaderBackground />
            <div className="landingFiltersHolder">
                <div className="landingInstruction">
                    INDIQUEZ LES 
                    <br /> 
                    <div className="landingInstructionInnerText">

                        CRITÈRES DE SIMULATION:
                    </div>
                </div>
                <div className="landingFilters">
                    <FilterSelect
                        label="Marchandise"
                        placeholder="Sélectionner…"
                        value={merchandise}
                        onValueChange={setMerchandise}
                        options={merchandises.map((m) => ({ value: m.codeSH, label: m.name }))}
                    />

                    <FilterSelect
                        label="Port de départ"
                        placeholder="Sélectionner…"
                        value={departure}
                        onValueChange={setDeparture}
                        options={departurePorts.map((p) => ({ value: p.code, label: `${p.name} — ${p.city}, ${p.country}` }))}
                    />

                    <FilterSelect
                        label="Port d'arrivée"
                        placeholder="Sélectionner…"
                        value={arrival}
                        onValueChange={setArrival}
                        options={arrivalPorts.map((p) => ({ value: p.code, label: `${p.name} — ${p.city}, ${p.country}` }))}
                    />

                    <FilterSelect
                        label="Incoterm"
                        placeholder="Sélectionner…"
                        value={incoterm}
                        onValueChange={setIncoterm}
                        options={incoterms.map((i) => ({ value: i.code, label: `${i.code} — ${i.name}` }))}
                    />
                </div>

                {loadError && <p className="landingError">{loadError}</p>}

            </div>
            <button
                className="landingSimulateButton"
                onClick={handleSimulate}
                disabled={!canSimulate}
                style={{ left: `${circleLeftPercent}%` }}
            >
                Simuler ►
            </button>
            <Footer showCarousel />
        </div>
    );
}

export default LandingPage;
