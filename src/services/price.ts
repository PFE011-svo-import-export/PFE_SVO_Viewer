import { getJson } from "./catalog";

/** Prix quotidiens du café (indicateur ICO), cf. IcipDailyData côté API. */
export interface CoffeePrices {
    composite: number;
    colombianMilds: number;
    otherMilds: number;
    brazilianNaturals: number;
    robustas: number;
}

export function getCoffeePrices(): Promise<CoffeePrices> {
    return getJson<CoffeePrices>("/prices/coffee");
}
