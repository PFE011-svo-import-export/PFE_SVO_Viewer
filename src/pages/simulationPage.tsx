import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getProcess, type Process } from "../services/process";
import '../styles/pages/simulationPage.css'

function SimulationPage() {
    const { processCode } = useParams<{ processCode: string }>();
    const [process, setProcess] = useState<Process | null>(null);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        if (!processCode) return;

        let cancelled = false;
        setProcess(null);
        setLoadError("");

        getProcess(processCode)
            .then((result) => {
                if (!cancelled) setProcess(result);
            })
            .catch(() => {
                if (!cancelled) setLoadError("Impossible de charger la simulation.");
            });

        return () => { cancelled = true; };
    }, [processCode]);

    if (!processCode) {
        return <div id="simulationPage">Sélectionnez une simulation depuis la page d'accueil.</div>;
    }

    if (loadError) {
        return <div id="simulationPage">{loadError}</div>;
    }

    if (!process) {
        return <div id="simulationPage">Chargement…</div>;
    }

    return (
        <div id="simulationPage">
            <h1>{process.code}</h1>
            {process.sections.map((section) => (
                <section key={section.code} className="simulationSection">
                    <h2>{section.sectionName}</h2>
                    {section.phases.map((phase) => (
                        <div key={phase.code} className="simulationPhase">
                            <h3>{phase.code}</h3>
                            <ul>
                                {phase.steps.map((step) => (
                                    <li key={step.code}>{step.question ?? step.code}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}

export default SimulationPage;
