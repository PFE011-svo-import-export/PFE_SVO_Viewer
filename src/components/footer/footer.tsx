import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCoffeePrices, type CoffeePrices } from "../../services/price";
import "../../styles/footer.css";

const PRICE_LABELS: { key: keyof CoffeePrices; label: string }[] = [
    { key: "composite", label: "ICO Composite" },
    { key: "colombianMilds", label: "Colombian Milds" },
    { key: "otherMilds", label: "Other Milds" },
    { key: "brazilianNaturals", label: "Brazilian Naturals" },
    { key: "robustas", label: "Robustas" },
];

const PIXELS_PER_SECOND = 60;

function TickerItem({ label, value }: { label: string; value: number }) {
    return (
        <div className="footerTickerItem">
            <span className="footerTickerLabel">{label}</span>
            <span className="footerTickerValue">{value.toFixed(2)}&cent;/lb</span>
        </div>
    );
}

function TickerGroup({ prices, keyPrefix, measureRef }: {
    prices: CoffeePrices;
    keyPrefix: string;
    measureRef?: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <div className="footerTickerGroup" ref={measureRef}>
            {PRICE_LABELS.map(({ key, label }) => (
                <TickerItem key={`${keyPrefix}-${key}`} label={label} value={prices[key]} />
            ))}
        </div>
    );1
}

function Footer({ showCarousel = false }: { showCarousel?: boolean }) {
    const [prices, setPrices] = useState<CoffeePrices | null>(null);
    const [loadError, setLoadError] = useState("");
    const [repeatCount, setRepeatCount] = useState(1);
    const [groupWidth, setGroupWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const groupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showCarousel) return;

        let cancelled = false;

        getCoffeePrices()
            .then((data) => {
                if (!cancelled) setPrices(data);
            })
            .catch(() => {
                if (!cancelled) setLoadError("Prix du café indisponibles.");
            });

        return () => { cancelled = true; };
    }, [showCarousel]);

    useLayoutEffect(() => {
        if (!showCarousel || !prices) return;

        const updateRepeatCount = () => {
            const containerWidth = containerRef.current?.offsetWidth ?? 0;
            const width = groupRef.current?.offsetWidth ?? 0;
            if (width === 0) return;
            setGroupWidth(width);
            setRepeatCount(Math.max(1, Math.ceil(containerWidth / width)));
        };

        updateRepeatCount();
        window.addEventListener("resize", updateRepeatCount);
        return () => window.removeEventListener("resize", updateRepeatCount);
    }, [showCarousel, prices]);

    if (!showCarousel) return null;

    if (loadError) {
        return <div id="footer" className="footerMessage">{loadError}</div>;
    }

    if (!prices) {
        return <div id="footer" className="footerMessage">Chargement des prix du café…</div>;
    }

    const blockWidth = groupWidth * repeatCount;
    const animationDuration = blockWidth > 0 ? blockWidth / PIXELS_PER_SECOND : 25;

    return (
        <div id="footer" ref={containerRef}>
            <div
                className="footerTickerTrack"
                style={{ animationDuration: `${animationDuration}s` }}
            >
                <div className="footerTickerBlock">
                    {Array.from({ length: repeatCount }, (_, i) => (
                        <TickerGroup
                            key={`a-${i}`}
                            keyPrefix={`a-${i}`}
                            prices={prices}
                            measureRef={i === 0 ? groupRef : undefined}
                        />
                    ))}
                </div>
                <div className="footerTickerBlock" aria-hidden="true">
                    {Array.from({ length: repeatCount }, (_, i) => (
                        <TickerGroup key={`b-${i}`} keyPrefix={`b-${i}`} prices={prices} />
                    ))}
                </div>

            {/*CHATBOT SECTION */}
            </div>
            <div id = "chatBot">
                <div className="chatBotButton">
                    <div className="chatBotTextBox">
                        <div className="chatBotText">
                            Tu as une question?
                        </div>
                        <div className="chatBotTextBoxArrow"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Footer;
