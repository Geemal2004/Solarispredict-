import type { DispatchAdvisory, NetLoadPoint } from "@/lib/api";
import type { Plant, PlantType } from "@/lib/plants";

/** Illustrative hourly plant output from zone forecast + merit-order cues. */
export function estimatePlantOutputs(
  plants: Plant[],
  point: NetLoadPoint | null | undefined,
  advisory?: DispatchAdvisory | null
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!point) {
    for (const p of plants) out[p.name] = p.capacity_mw * 0.55;
    return out;
  }

  const byType = (t: PlantType) => plants.filter((p) => p.type === t);
  const cap = (list: Plant[]) =>
    list.reduce((s, p) => s + p.capacity_mw, 0) || 1;

  const solarPlants = byType("solar");
  const windPlants = byType("wind");
  const hydroPlants = byType("hydro");
  const oilPlants = byType("oil");
  const coalPlants = byType("coal");

  const solarCap = cap(solarPlants);
  const solarIntensity = Math.min(1.15, Math.max(0, point.solar_mw / solarCap));
  for (const p of solarPlants) {
    out[p.name] = p.capacity_mw * solarIntensity;
  }

  const cloud = point.cloudcover_pct ?? 45;
  const windFactor = Math.min(
    0.95,
    Math.max(0.12, 0.35 + (1 - cloud / 100) * 0.45 + (point.ghi_wm2 ?? 0) / 2500)
  );
  for (const p of windPlants) {
    out[p.name] = p.capacity_mw * windFactor;
  }

  // Hydro: hold for TOU evening; ease off midday when solar is strong.
  const hydroFactor = point.tou_peak
    ? 0.88
    : solarIntensity > 0.55
      ? 0.42
      : 0.62;
  for (const p of hydroPlants) {
    out[p.name] = p.capacity_mw * hydroFactor;
  }

  // Coal: baseload with mild solar midday dip.
  const coalFactor = solarIntensity > 0.6 ? 0.78 : 0.92;
  for (const p of coalPlants) {
    out[p.name] = p.capacity_mw * coalFactor;
  }

  // Oil: ramp down on solar / hosting risk; up on evening peak / high net load.
  let oilFactor = 0.55;
  if (point.hosting_risk || point.curtailment_risk) oilFactor = 0.22;
  else if (point.tou_peak) oilFactor = 0.72;
  else if (solarIntensity > 0.5) oilFactor = 0.28;
  else if (point.net_load_mw > point.demand_mw * 0.85) oilFactor = 0.68;

  for (const p of oilPlants) {
    out[p.name] = p.capacity_mw * oilFactor;
  }

  // Advisory boost: named plants get a confidence-weighted nudge toward capacity.
  if (advisory) {
    const match = advisory.recommendations.find(
      (r) => r.timestamp === point.timestamp
    );
    if (match) {
      for (const a of match.actions ?? []) {
        const plant = plants.find((p) => p.name === a.plant);
        if (!plant) continue;
        const target =
          a.mw != null
            ? Math.min(plant.capacity_mw, Math.max(0, a.mw))
            : plant.capacity_mw * (0.45 + a.confidence * 0.45);
        out[a.plant] = target;
      }
      for (const name of match.plants) {
        const plant = plants.find((p) => p.name === name);
        if (!plant || out[name] == null) continue;
        out[name] = Math.min(
          plant.capacity_mw,
          out[name] * (1 + match.confidence * 0.25)
        );
      }
    }
  }

  return out;
}

export function aggregateOutputByType(
  plants: Plant[],
  outputs: Record<string, number>
): Record<PlantType, number> {
  const acc: Record<PlantType, number> = {
    hydro: 0,
    coal: 0,
    oil: 0,
    wind: 0,
    solar: 0,
  };
  for (const p of plants) {
    acc[p.type] += outputs[p.name] ?? 0;
  }
  return acc;
}

export function formatPlaybackClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-LK", {
    timeZone: "Asia/Colombo",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Inline estimate marker for merit-order / model dispatch MW — not SCADA. */
export function fmtEstMw(n: number, digits = 0): string {
  return `~${n.toLocaleString("en-LK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

export function fmtEstDispatchPair(estimateMw: number, capacityMw: number): string {
  return `${fmtEstMw(estimateMw)} / ${Math.round(capacityMw).toLocaleString("en-LK")} MW`;
}
