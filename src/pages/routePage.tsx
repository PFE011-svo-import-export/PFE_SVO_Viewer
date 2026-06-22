import MapView from "../components/map/MapView";
import '../styles/pages/routePage.css'

/**
 * Page Route : carte qui remplit l'espace sous le header (qui reste visible).
 * Les overlays (panneaux d'interaction) viendront plus tard en children de MapView.
 */
function RoutePage() {
    return (
        <div id="routePage">
            <MapView width="100%" height="100%" />
        </div>
    )
}

export default RoutePage;
