export type Zone = "hambantota" | "jaffna" | "colombo";

export const ZONES: { id: Zone; label: string; note: string }[] = [
  { id: "hambantota", label: "Hambantota", note: "Dry zone · Buruthakanda" },
  { id: "jaffna", label: "Jaffna", note: "Northern load centre" },
  { id: "colombo", label: "Colombo", note: "West coast · highest demand" },
];

export interface NetLoadPoint {
  timestamp: string;
  solar_mw: number;
  demand_mw: number;
  net_load_mw: number;
  curtailment_risk: boolean;
  hosting_risk?: boolean;
  tou_peak?: boolean;
  weather_regime?: string;
  ghi_wm2?: number;
  cloudcover_pct?: number | null;
  is_weekend?: boolean;
  is_poya?: boolean;
  is_new_year?: boolean;
  is_vesak?: boolean;
  day_multiplier?: number;
  solar_p10_mw?: number;
  solar_p90_mw?: number;
}

export interface NetLoadForecast {
  zone: Zone;
  hours: number;
  curtailment_threshold_mw: number;
  risk_threshold_mw?: number;
  any_curtailment_risk: boolean;
  any_hosting_risk?: boolean;
  weather_regime?: string;
  evening_ramp_mw?: number | null;
  tou_peak_window?: string;
  methodology: {
    solar: string;
    demand: string;
    net_load: string;
    risk?: string;
  };
  points: NetLoadPoint[];
}

export interface SolarQuantileForecast {
  zone: Zone;
  hours: number;
  quantiles: number[];
  points: {
    timestamp: string;
    p10_mw: number;
    p50_mw: number;
    p90_mw: number;
  }[];
  methodology: string;
}

export interface BacktestMetrics {
  zone: Zone;
  rmse: number;
  mae: number;
  n_train: number;
  n_test: number;
  target: string;
  unit: string;
  rolling_mae?: { date: string; mae: number }[];
  feature_importance?: { feature: string; importance: number }[];
}

export interface RooftopPoint {
  lat: number;
  lon: number;
  capacity_kw: number;
  province: string;
}

export interface RooftopSample {
  n_points: number;
  target_mw: number;
  total_mw: number;
  methodology: string;
  points: RooftopPoint[];
}

export interface CebBaseline {
  source: string;
  year_label: string;
  disclaimer: string;
  installed_capacity_mw: number;
  renewable_share_pct: number;
  rooftop_solar_mw: number;
  rooftop_connections: number;
  rooftop_energy_share_pct: number;
  grid_solar_mw: number;
  night_max_demand_mw: number;
  day_max_demand_mw: number;
  tou_peak_window: string;
  tou_note: string;
  annual_report_2023?: {
    day_peak_example: { mw: number; datetime_local: string; note: string };
    night_peak_example: { mw: number; datetime_local: string };
    ncre_visibility: string;
  };
}

export interface CalendarHorizon {
  hours: number;
  start: string;
  active: {
    weekend: boolean;
    poya: boolean;
    new_year: boolean;
    vesak: boolean;
  };
  events: { date: string; flags: string[] }[];
  methodology: string;
}

export interface SolarEvidence {
  zone: Zone;
  literature: {
    paper: string;
    normalized_rmse: {
      smart_persistence: number;
      dbn: number;
      svm: number;
      random_forest: number;
    };
    note: string;
    hardest_regime: string;
  };
  this_build: BacktestMetrics | null;
  model_family: string;
}

export interface NationalStats {
  as_of: string;
  estimated: boolean;
  solar_mw_now: number;
  demand_mw_now: number;
  net_load_mw_now: number;
  zone_estimated?: {
    solar_mw_now: number;
    demand_mw_now: number;
    net_load_mw_now: number;
    note: string;
  };
  national_digest_reference?: {
    night_max_demand_mw: number;
    day_max_demand_mw: number;
    installed_capacity_mw: number;
    rooftop_solar_mw: number;
    renewable_share_pct: number;
  };
  zone_breakdown: {
    zone: string;
    solar_mw: number;
    demand_mw: number;
    net_load_mw: number;
  }[];
  generation_mix_reference: {
    capacity_mw: Record<string, number>;
    shares: Record<string, number>;
    note: string;
  };
  generation_mix_live_solar_share: number;
  sector_demand_mw: Record<string, number>;
  sector_shares: Record<string, number>;
  sector_source: string;
  avoidable_curtailment: {
    mwh_next_hour: number;
    rs_million_illustrative: number;
    note: string;
  };
  labels: { footer: string };
}

export interface DispatchAdvisory {
  zone: Zone;
  hours: number;
  threshold_mw: number;
  any_risk: boolean;
  evening_ramp_mw?: number | null;
  weather_regime?: string;
  methodology: string;
  recommendations: {
    timestamp: string | null;
    severity: string;
    confidence: number;
    plants: string[];
    actions?: {
      plant: string;
      action: string;
      mw: number | null;
      confidence: number;
    }[];
    text: string;
  }[];
}

export interface FpvReservoirs {
  season: string;
  disclaimer: string;
  citation: string;
  reservoirs: { name: string; lat: number; lon: number; note: string }[];
}

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Copy .env.local.example to .env.local."
    );
  }
  return base.replace(/\/$/, "");
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      /* keep */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function fetchNetLoadForecast(zone: Zone, hours = 48) {
  return getJson<NetLoadForecast>(
    `/forecast/netload?zone=${encodeURIComponent(zone)}&hours=${hours}`
  );
}

export function fetchSolarQuantiles(zone: Zone, hours = 48) {
  return getJson<SolarQuantileForecast>(
    `/forecast/solar/quantiles?zone=${encodeURIComponent(zone)}&hours=${hours}`
  );
}

export function fetchBacktest(zone: Zone) {
  return getJson<BacktestMetrics>(`/backtest?zone=${encodeURIComponent(zone)}`);
}

export function fetchRooftopSample(n = 400) {
  return getJson<RooftopSample>(`/rooftop/sample?n=${n}`);
}

export function fetchNationalStats() {
  return getJson<NationalStats>("/stats/national");
}

export function fetchCebBaseline() {
  return getJson<CebBaseline>("/stats/ceb-baseline");
}

export function fetchDispatchAdvisory(zone: Zone, hours = 48) {
  return getJson<DispatchAdvisory>(
    `/advisory/dispatch?zone=${encodeURIComponent(zone)}&hours=${hours}`
  );
}

export function fetchSolarEvidence(zone: Zone) {
  return getJson<SolarEvidence>(
    `/evidence/solar?zone=${encodeURIComponent(zone)}`
  );
}

export function fetchCalendar(hours = 48) {
  return getJson<CalendarHorizon>(`/calendar?hours=${hours}`);
}

export function fetchFpvReservoirs() {
  return getJson<FpvReservoirs>("/map/fpv-reservoirs");
}
