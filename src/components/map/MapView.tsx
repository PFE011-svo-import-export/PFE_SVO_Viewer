import { Map } from "react-map-gl/mapbox";
import type { ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * Composant carte reutilisable (Mapbox via react-map-gl).
 *
 * - width / height : dimensionnent le conteneur. Par defaut la carte remplit
 *   son parent (100%). Plein ecran -> parent plein ecran ; petite carte ->
 *   parent petit.
 * - children : overlays poses par-dessus la carte (panneaux de selection, etc.).
 *   Le conteneur est en position: relative pour que les enfants en
 *   position: absolute se placent par rapport a la carte.
 *
 * Etat de la vue (centre/zoom) gere en interne par defaut (non controle).
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface ViewState {
    longitude: number;
    latitude: number;
    zoom: number;
}

interface MapViewProps {
    width?: string | number;
    height?: string | number;
    initialView?: ViewState;
    mapStyle?: string;
    children?: ReactNode;
}

// Vue par defaut : Montreal (ETS).
const DEFAULT_VIEW: ViewState = {
    longitude: -73.5673,
    latitude: 45.5017,
    zoom: 11,
};

function MapView({
    width = "100%",
    height = "100%",
    initialView = DEFAULT_VIEW,
    mapStyle = "mapbox://styles/mapbox/streets-v12",
    children,
}: MapViewProps) {
    return (
        <div style={{ position: "relative", width, height }}>
            <Map
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={initialView}
                mapStyle={mapStyle}
                style={{ width: "100%", height: "100%" }}
            />
            {children}
        </div>
    );
}

export default MapView;
