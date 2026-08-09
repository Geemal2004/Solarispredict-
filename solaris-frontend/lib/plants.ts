export type PlantType = "hydro" | "coal" | "oil" | "wind" | "solar";

export interface Plant {
  name: string;
  type: PlantType;
  capacity_mw: number;
  lat: number;
  lon: number;
  note: string;
}

export const PLANT_COLORS: Record<PlantType, string> = {
  hydro: "#1B2A4A",
  coal: "#2E2E2E",
  oil: "#B5533C",
  wind: "#2E7D6B",
  solar: "#E8A33D",
};

export const PLANT_LABELS: Record<PlantType, string> = {
  hydro: "Hydro",
  coal: "Coal",
  oil: "Oil / thermal",
  wind: "Wind",
  solar: "Solar (utility)",
};

export function plantRadius(capacityMw: number): number {
  return Math.max(3.5, Math.sqrt(capacityMw) * 0.85);
}
