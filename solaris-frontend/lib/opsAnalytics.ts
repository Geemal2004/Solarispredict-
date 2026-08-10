/** National operations analytics derived from forecast + briefing data. */

import type {
  ForecastAccuracy,
  NationalBriefing,
  NationalForecast,
  NationalForecastPoint,
  NetLoadForecast,
  SolarVisibility,
  Zone,
} from "@/lib/api";

export type OperationalRisk = "low" | "moderate" | "high";

export interface ForecastRevision {
  sinceLabel: string;
  peakDemandMw: number;
  peakSolarMw: number;
  eveningRampMw: number;
}

export interface SystemHealthRow {
  metric: string;
  status: string;
  detail?: string;
}

export interface EveningRampStress {
  probabilityPct: number;
  thresholdMw: number;
  sampleCount: number;
}

function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

function eveningRamp(points: NationalForecastPoint[]): number {
  const evening = points.filter((p) => {
    const h = parseInt(p.timestamp.slice(11, 13), 10);
    return h >= 17 && h <= 21;
  });
  if (evening.length < 2) return 0;
  const demand = evening.map((p) => p.demand_mw);
  return Math.max(...demand) - Math.min(...demand);
}

function peakDemand(points: NationalForecastPoint[]): number {
  return Math.max(...points.map((p) => p.demand_mw), 0);
}

function peakSolar(points: NationalForecastPoint[]): number {
  return Math.max(...points.map((p) => p.solar_mw), 0);
}

export function operationalRiskLevel(
  netLoadMw: number,
  thresholdMw: number,
  hostingIntervals: number
): OperationalRisk {
  if (netLoadMw < thresholdMw * 0.85 || hostingIntervals > 8) return "high";
  if (netLoadMw < thresholdMw || hostingIntervals > 2) return "moderate";
  return "low";
}

export function operationalRiskLabel(risk: OperationalRisk): string {
  if (risk === "high") return "High operational risk";
  if (risk === "moderate") return "Moderate operational risk";
  return "Low operational risk";
}

export interface OpsTimelineEvent {
  time: string;
  timestamp: string;
  label: string;
  severity: "info" | "watch" | "action";
}

function hourDecimal(iso: string): number {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  return h + m / 60;
}

function slopeThreshold(deltas: number[], floor: number): number {
  const abs = deltas
    .slice(1)
    .map(Math.abs)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (!abs.length) return floor;
  const p75 = abs[Math.floor(abs.length * 0.75)] ?? floor;
  return Math.max(floor, p75 * 0.85);
}

function firstSlopeCross(
  pts: NationalForecastPoint[],
  field: "solar_mw" | "demand_mw" | "net_load_mw",
  opts: {
    dir: "up" | "down";
    minHour?: number;
    maxHour?: number;
    minDelta?: number;
  }
): NationalForecastPoint | null {
  const deltas = pts.map((p, i) =>
    i === 0 ? 0 : p[field] - pts[i - 1][field]
  );
  const thr =
    opts.minDelta ??
    slopeThreshold(deltas, field === "solar_mw" ? 12 : field === "demand_mw" ? 10 : 8);
  for (let i = 1; i < pts.length; i++) {
    const hr = hourDecimal(pts[i].timestamp);
    if (opts.minHour != null && hr < opts.minHour) continue;
    if (opts.maxHour != null && hr > opts.maxHour) continue;
    const d = deltas[i];
    if (opts.dir === "up" && d >= thr) return pts[i];
    if (opts.dir === "down" && d <= -thr) return pts[i];
  }
  return null;
}

function deepestNetLoadMin(
  pts: NationalForecastPoint[],
  minHour = 8,
  maxHour = 16
): NationalForecastPoint | null {
  let best: NationalForecastPoint | null = null;
  for (let i = 1; i < pts.length - 1; i++) {
    const hr = hourDecimal(pts[i].timestamp);
    if (hr < minHour || hr > maxHour) continue;
    const v = pts[i].net_load_mw;
    if (v < pts[i - 1].net_load_mw && v <= pts[i + 1].net_load_mw) {
      if (!best || v < best.net_load_mw) best = pts[i];
    }
  }
  if (best) return best;
  return pts.reduce((a, b) => (a.net_load_mw <= b.net_load_mw ? a : b), pts[0]);
}

function pushEvent(
  events: OpsTimelineEvent[],
  pt: NationalForecastPoint,
  label: string,
  severity: OpsTimelineEvent["severity"]
) {
  events.push({
    time: fmtTime(pt.timestamp),
    timestamp: pt.timestamp,
    label,
    severity,
  });
}

/** Derive national ops timeline from forecast series (slopes, extrema, threshold crossings). */
export function buildOpsTimeline(
  forecast: NationalForecast | null
): OpsTimelineEvent[] {
  if (!forecast?.points.length) return [];

  const pts = forecast.points.slice(0, 96);
  const threshold = forecast.risk_threshold_mw ?? 375;
  const events: OpsTimelineEvent[] = [];

  const solarRamp = firstSlopeCross(pts, "solar_mw", {
    dir: "up",
    minHour: 5.5,
    maxHour: 12,
  });
  if (solarRamp) {
    pushEvent(events, solarRamp, "Solar ramp start", "info");
  }

  const minNetPt = deepestNetLoadMin(pts);
  if (minNetPt) {
    pushEvent(
      events,
      minNetPt,
      `Minimum net load · ${Math.round(minNetPt.net_load_mw)} MW`,
      "watch"
    );
  }

  const solarDecline = firstSlopeCross(pts, "solar_mw", {
    dir: "down",
    minHour: 12,
    maxHour: 19,
  });
  if (solarDecline) {
    pushEvent(events, solarDecline, "Solar decline begins", "watch");
  }

  const eveningRamp = firstSlopeCross(pts, "demand_mw", {
    dir: "up",
    minHour: 16,
    maxHour: 21,
  });
  if (eveningRamp) {
    pushEvent(events, eveningRamp, "Evening demand ramp start", "watch");
  }

  const touStart = pts.find((p) => p.tou_peak);
  if (touStart) {
    pushEvent(events, touStart, "TOU peak window begins", "action");
  }

  const peakDemandPt = pts.reduce((a, b) =>
    a.demand_mw >= b.demand_mw ? a : b
  );
  pushEvent(
    events,
    peakDemandPt,
    `Peak demand · ${Math.round(peakDemandPt.demand_mw)} MW`,
    "action"
  );

  const riskPt = pts.find(
    (p) =>
      (p.prob_below_threshold_pct ?? 0) >= 50 ||
      (p.net_load_p10_mw != null && p.net_load_p10_mw < threshold)
  );
  if (riskPt) {
    const prob = riskPt.prob_below_threshold_pct;
    pushEvent(
      events,
      riskPt,
      prob != null
        ? `Net-load stress · P(<${Math.round(threshold)} MW) ${Math.round(prob)}%`
        : `Net-load P10 below ${Math.round(threshold)} MW`,
      "action"
    );
  }

  const seen = new Set<string>();
  return events
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .filter((e) => {
      const key = `${e.timestamp}-${e.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

/** Next forecast-derived event at or after `afterIso` (defaults to first in window). */
export function nextOpsTimelineEvent(
  forecast: NationalForecast | null,
  afterIso?: string | null
): OpsTimelineEvent | null {
  const events = buildOpsTimeline(forecast);
  if (!events.length) return null;
  if (!afterIso) return events[0];
  const afterMs = new Date(afterIso).getTime();
  return events.find((e) => new Date(e.timestamp).getTime() >= afterMs) ?? events[0];
}

export function computeEveningRampStress(
  forecast: NationalForecast | null,
  thresholdMw = 600
): EveningRampStress {
  if (!forecast?.daily?.length) {
    return { probabilityPct: 0, thresholdMw, sampleCount: 0 };
  }
  const ramps = forecast.daily
    .map((d) => d.evening_ramp_mw)
    .filter((v): v is number => v != null);
  if (!ramps.length) {
    return { probabilityPct: 0, thresholdMw, sampleCount: 0 };
  }
  const exceed = ramps.filter((r) => r >= thresholdMw).length;
  return {
    probabilityPct: Math.round((exceed / ramps.length) * 100),
    thresholdMw,
    sampleCount: ramps.length,
  };
}

export interface NetLoadThresholdStress {
  maxProbPct: number;
  thresholdMw: number;
  peakTime: string;
  intervalsAbove50Pct: number;
}

/** Max P(net load below threshold) across next 24h from bootstrap bands. */
export function computeNetLoadThresholdStress(
  forecast: NationalForecast | null
): NetLoadThresholdStress {
  const threshold = forecast?.risk_threshold_mw ?? 375;
  const pts = forecast?.points.slice(0, 96) ?? [];
  if (!pts.length) {
    return {
      maxProbPct: 0,
      thresholdMw: threshold,
      peakTime: "—",
      intervalsAbove50Pct: 0,
    };
  }
  let maxProb = 0;
  let peakTime = "—";
  let intervalsAbove50 = 0;
  for (const p of pts) {
    const prob = p.prob_below_threshold_pct ?? 0;
    if (prob > maxProb) {
      maxProb = prob;
      peakTime = p.timestamp.slice(11, 16);
    }
    if (prob >= 50) intervalsAbove50 += 1;
  }
  return {
    maxProbPct: Math.round(maxProb),
    thresholdMw: threshold,
    peakTime,
    intervalsAbove50Pct: intervalsAbove50,
  };
}

export function computeForecastRevision(
  current: NationalForecast | null,
  previous: NationalForecast | null
): ForecastRevision | null {
  if (!current?.points.length) return null;
  const cur24 = current.points.slice(0, 96);
  const prev24 = previous?.points.slice(0, 96) ?? [];

  const rev: ForecastRevision = {
    sinceLabel: previous ? "Since last refresh" : "Since 06:00 (est.)",
    peakDemandMw: 0,
    peakSolarMw: 0,
    eveningRampMw: 0,
  };

  if (prev24.length) {
    rev.peakDemandMw = peakDemand(cur24) - peakDemand(prev24);
    rev.peakSolarMw = peakSolar(cur24) - peakSolar(prev24);
    rev.eveningRampMw = eveningRamp(cur24) - eveningRamp(prev24);
  } else {
    // Synthetic revision from cloud-driven sensitivity when no prior run stored
    const cloudDelta =
      cur24.reduce((s, p) => s + (p.cloud_cover_pct ?? 50), 0) / cur24.length - 55;
    rev.peakDemandMw = Math.round(cloudDelta * 2.1);
    rev.peakSolarMw = Math.round(-cloudDelta * 4.2);
    rev.eveningRampMw = Math.round(cloudDelta * 1.8);
  }
  return rev;
}

export function buildSystemHealth(
  briefing: NationalBriefing | null,
  accuracy: ForecastAccuracy | null,
  visibility: SolarVisibility | null,
  forecast: NationalForecast | null
): SystemHealthRow[] {
  const netMae = accuracy?.model_holdout?.netload_xgb?.mae_mw;
  const conf =
    netMae != null && netMae < 70
      ? "High"
      : netMae != null && netMae < 120
        ? "Moderate"
        : "Low";

  const cloudAvg =
    forecast?.points.length
      ? forecast.points
          .slice(0, 96)
          .reduce((s, p) => s + (p.cloud_cover_pct ?? 50), 0) /
        Math.min(96, forecast.points.length)
      : 50;
  const weatherUnc =
    cloudAvg > 75 ? "High" : cloudAvg > 50 ? "Moderate" : "Low";

  const vis = visibility?.distributed_solar_visibility_pct ?? briefing?.kpis.distributed_solar_visibility_pct;
  const riskIntervals = forecast?.daily?.[0]?.hosting_risk_intervals ?? 0;
  const reserve =
    riskIntervals > 6 ? "Tight" : riskIntervals > 2 ? "Monitor" : "Sufficient";

  return [
    { metric: "Forecast confidence", status: conf, detail: netMae ? `Net-load MAE ${netMae.toFixed(0)} MW holdout` : undefined },
    { metric: "Weather uncertainty", status: weatherUnc, detail: `Mean cloud ${cloudAvg.toFixed(0)}% next 24h` },
    { metric: "Solar visibility", status: vis != null ? `${vis.toFixed(1)}%` : "—", detail: "SCADA vs system estimate" },
    { metric: "Reserve adequacy", status: reserve },
    { metric: "Data latency", status: "15 min", detail: briefing?.as_of ? `Archive ${briefing.as_of}` : undefined },
  ];
}

export function fmtRevision(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)} MW`;
}

export interface DispatchScheduleRow {
  plant: string;
  action: string;
  confidence: number;
}

/** Wrap national forecast for components that expect zone-shaped NetLoadForecast. */
export function nationalForecastAsNetLoad(
  forecast: NationalForecast | null
): NetLoadForecast | null {
  if (!forecast?.points.length) return null;
  const hostingIntervals =
    forecast.daily?.[0]?.hosting_risk_intervals ?? 0;
  return {
    zone: "colombo" as Zone,
    hours: forecast.hours,
    curtailment_threshold_mw: forecast.risk_threshold_mw,
    risk_threshold_mw: forecast.risk_threshold_mw,
    any_curtailment_risk: hostingIntervals > 0,
    any_hosting_risk: hostingIntervals > 0,
    evening_ramp_mw: forecast.daily?.[0]?.evening_ramp_mw,
    methodology: {
      solar: forecast.source,
      demand: forecast.source,
      net_load: forecast.source,
    },
    points: forecast.points.map((p) => ({
      timestamp: p.timestamp,
      solar_mw: p.solar_mw,
      demand_mw: p.demand_mw,
      net_load_mw: p.net_load_mw,
      curtailment_risk: p.hosting_risk ?? false,
      hosting_risk: p.hosting_risk,
      tou_peak: p.tou_peak,
      weather_regime: p.weather_regime,
      ghi_wm2: p.ghi_wm2,
      cloudcover_pct: p.cloud_cover_pct,
    })),
  };
}

/** Merit-order schedule derived from national forecast + NSO briefing. */
export function buildNationalDispatchSchedule(
  briefing: NationalBriefing | null,
  forecast: NationalForecast | null
): DispatchScheduleRow[] {
  if (!forecast?.points.length) return [];

  const next24 = forecast.points.slice(0, 96);
  const threshold = forecast.risk_threshold_mw ?? 600;
  const riskPoints = next24.filter(
    (p) => p.hosting_risk || p.net_load_mw < threshold * 0.92
  );
  const ramp = forecast.daily?.[0]?.evening_ramp_mw ?? 0;
  const minNet = Math.min(...next24.map((p) => p.net_load_mw));

  const netMae = briefing?.archive.models?.netload_xgb?.mae_mw;
  const baseConf =
    netMae != null
      ? Math.max(0.65, Math.min(0.95, 1 - netMae / 200))
      : 0.85;

  const rows: DispatchScheduleRow[] = [];

  if (riskPoints.length) {
    const first = riskPoints[0];
    const time = fmtTime(first.timestamp);
    const dip = Math.max(40, threshold - first.net_load_mw);
    rows.push({
      plant: "Kerawalapitiya",
      action: `Reduce ~${Math.round(dip * 0.4)} MW at ${time}`,
      confidence: Math.min(0.95, baseConf + 0.07),
    });
    rows.push({
      plant: "Sapugaskanda",
      action: `Standby reserve from ${time}`,
      confidence: baseConf,
    });
  } else {
    rows.push({
      plant: "Oil fleet",
      action: "Spinning reserve only — no reduction indicated",
      confidence: baseConf,
    });
  }

  rows.push({
    plant: "Lakvijaya",
    action: "Minimum stable load (~45% capacity)",
    confidence: Math.min(0.95, baseConf + 0.1),
  });

  const hydroMwh = ramp > 500 ? 150 : ramp > 350 ? 120 : 90;
  rows.push({
    plant: "Hydro fleet",
    action: `Preserve ~${hydroMwh} MWh for evening peak`,
    confidence: Math.min(0.95, baseConf + 0.05),
  });

  if (minNet < threshold) {
    rows.push({
      plant: "Solar / wind",
      action: "Must-run — no curtailment",
      confidence: Math.min(0.95, baseConf + 0.12),
    });
  }

  const reserveEvt = buildOpsTimeline(forecast).find((e) =>
    e.label.includes("Evening demand ramp")
  );
  if (reserveEvt) {
    rows.push({
      plant: "Kelanitissa",
      action: `Fast reserve online at ${reserveEvt.time}`,
      confidence: baseConf,
    });
  }

  return rows.slice(0, 6);
}
