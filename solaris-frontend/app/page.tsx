"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BacktestAccuracyPanel } from "@/app/components/BacktestAccuracyPanel";
import { HostingRiskBanner } from "@/app/components/CurtailmentBanner";
import { DispatchAdvisoryPanel } from "@/app/components/DispatchAdvisoryPanel";
import { EvidenceDrawer } from "@/app/components/EvidenceDrawer";
import { FeatureImportancePanel } from "@/app/components/FeatureImportancePanel";
import { ForecastSourceBadges } from "@/app/components/ForecastSourceBadges";
import {
  formatHorizonLabel,
  HorizonSelector,
  type ForecastHorizonHours,
} from "@/app/components/HorizonSelector";
import { LiveStatCards } from "@/app/components/LiveStatCards";
import { MapAdvancedStats } from "@/app/components/MapAdvancedStats";
import { MethodologyPanel } from "@/app/components/MethodologyPanel";
import { NetLoadChart } from "@/app/components/NetLoadChart";
import { ResearchEvidence } from "@/app/components/ResearchEvidence";
import { SectorBreakdown } from "@/app/components/SectorBreakdown";
import { StateOfGridStrip } from "@/app/components/StateOfGridStrip";
import { TimelineSlider } from "@/app/components/TimelineSlider";
import { ZoneSelector } from "@/app/components/ZoneSelector";
import plantsData from "@/data/plants.json";
import {
  fetchBacktest,
  fetchCalendar,
  fetchCebBaseline,
  fetchDispatchAdvisory,
  fetchFpvReservoirs,
  fetchNationalStats,
  fetchNetLoadForecast,
  fetchRooftopSample,
  fetchSolarEvidence,
  fetchSolarQuantiles,
  type BacktestMetrics,
  type CalendarHorizon,
  type CebBaseline,
  type DispatchAdvisory,
  type NationalStats,
  type NetLoadForecast,
  type RooftopPoint,
  type SolarEvidence,
  type Zone,
  ZONES,
} from "@/lib/api";
import { estimatePlantOutputs } from "@/lib/mapPlayback";
import type { Plant } from "@/lib/plants";

const MapPanel = dynamic(
  () => import("@/app/components/MapPanel").then((m) => m.MapPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center border border-[var(--line)] bg-[var(--panel)]/70">
        <p className="font-body text-sm text-[var(--ink-muted)]">Loading map…</p>
      </div>
    ),
  }
);

type TabId = "forecast" | "map" | "advisory" | "methodology";

const TABS: { id: TabId; label: string }[] = [
  { id: "forecast", label: "Forecast" },
  { id: "map", label: "National Map" },
  { id: "advisory", label: "Dispatch Advisory" },
  { id: "methodology", label: "Methodology" },
];

export default function DashboardPage() {
  const [tab, setTab] = useState<TabId>("forecast");
  const [zone, setZone] = useState<Zone>("hambantota");
  const [horizonHours, setHorizonHours] = useState<ForecastHorizonHours>(48);
  const [forecast, setForecast] = useState<NetLoadForecast | null>(null);
  const [advisory, setAdvisory] = useState<DispatchAdvisory | null>(null);
  const [stats, setStats] = useState<NationalStats | null>(null);
  const [ceb, setCeb] = useState<CebBaseline | null>(null);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [evidence, setEvidence] = useState<SolarEvidence | null>(null);
  const [calendar, setCalendar] = useState<CalendarHorizon | null>(null);
  const [rooftopPoints, setRooftopPoints] = useState<RooftopPoint[]>([]);
  const [showRooftop, setShowRooftop] = useState(false);
  const [showFpv, setShowFpv] = useState(true);
  const [fpvSeason, setFpvSeason] = useState("Feb–Apr peak resource");
  const [rooftopLoading, setRooftopLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [advisoryLoading, setAdvisoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hourIndex, setHourIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const requestId = useRef(0);
  const plants = plantsData as Plant[];

  const loadZoneData = useCallback(async (z: Zone, hours: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setAdvisoryLoading(true);
    setError(null);
    try {
      const [net, quantiles, backtest, adv, ev, cal] = await Promise.all([
        fetchNetLoadForecast(z, hours),
        fetchSolarQuantiles(z, hours).catch(() => null),
        fetchBacktest(z).catch(() => null),
        fetchDispatchAdvisory(z, hours),
        fetchSolarEvidence(z).catch(() => null),
        fetchCalendar(hours).catch(() => null),
      ]);
      if (id !== requestId.current) return;

      if (quantiles) {
        const byTs = new Map(
          quantiles.points.map((p) => [p.timestamp, p] as const)
        );
        net.points = net.points.map((p) => {
          const q = byTs.get(p.timestamp);
          return q
            ? { ...p, solar_p10_mw: q.p10_mw, solar_p90_mw: q.p90_mw }
            : p;
        });
      }
      setForecast(net);
      setMetrics(backtest);
      setAdvisory(adv);
      setEvidence(ev);
      setCalendar(cal);
      setHourIndex(0);
      setPlaying(false);
    } catch (err) {
      if (id !== requestId.current) return;
      setForecast(null);
      setAdvisory(null);
      setHourIndex(0);
      setPlaying(false);
      setError(err instanceof Error ? err.message : "Failed to load forecast");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setAdvisoryLoading(false);
      }
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [n, c] = await Promise.all([
        fetchNationalStats(),
        fetchCebBaseline(),
      ]);
      setStats(n);
      setCeb(c);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadZoneData(zone, horizonHours);
  }, [zone, horizonHours, loadZoneData]);

  useEffect(() => {
    void loadStats();
    void fetchFpvReservoirs()
      .then((r) => setFpvSeason(r.season))
      .catch(() => undefined);
    const t = setInterval(() => void loadStats(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadStats]);

  async function handleRooftopToggle(next: boolean) {
    setShowRooftop(next);
    if (next && rooftopPoints.length === 0) {
      setRooftopLoading(true);
      try {
        const sample = await fetchRooftopSample(400);
        setRooftopPoints(sample.points);
      } catch {
        setShowRooftop(false);
      } finally {
        setRooftopLoading(false);
      }
    }
  }

  const zoneLabel = ZONES.find((z) => z.id === zone)?.label ?? zone;
  const horizonLabel = formatHorizonLabel(horizonHours);

  const points = forecast?.points ?? [];
  const safeHourIndex = Math.min(hourIndex, Math.max(0, points.length - 1));
  const selectedPoint = points[safeHourIndex] ?? null;

  useEffect(() => {
    if (!playing || points.length === 0) return;
    const id = window.setInterval(() => {
      setHourIndex((prev) => {
        const next = prev + 1;
        if (next >= points.length) {
          setPlaying(false);
          return points.length - 1;
        }
        return next;
      });
    }, 650);
    return () => window.clearInterval(id);
  }, [playing, points.length]);

  const plantOutputs = useMemo(
    () => estimatePlantOutputs(plants, selectedPoint, advisory),
    [plants, selectedPoint, advisory]
  );

  const solarCap = useMemo(
    () =>
      plants
        .filter((p) => p.type === "solar")
        .reduce((s, p) => s + p.capacity_mw, 0) || 1,
    [plants]
  );
  const solarIntensity = selectedPoint
    ? Math.min(1, Math.max(0, selectedPoint.solar_mw / solarCap))
    : 0.4;

  const dispatchHighlight = useMemo(() => {
    const map: Record<string, number> = {};
    if (!advisory) return map;
    const match = selectedPoint
      ? advisory.recommendations.find(
          (r) => r.timestamp === selectedPoint.timestamp
        )
      : undefined;
    const recs = match
      ? [match]
      : advisory.recommendations.slice(0, 2);
    for (const rec of recs) {
      for (const a of rec.actions ?? []) {
        map[a.plant] = Math.max(map[a.plant] ?? 0, a.confidence);
      }
      for (const name of rec.plants) {
        map[name] = Math.max(map[name] ?? 0, rec.confidence * 0.7);
      }
    }
    return map;
  }, [advisory, selectedPoint]);

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="atmosphere" aria-hidden />
      <div className="monsoon-grain" aria-hidden />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
        <header className="mb-4 border border-[var(--line)] bg-[var(--panel-elevated)]">
          <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="status-led status-led-ok" />
                <p className="font-mono-readout text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  System Control · EST mode
                </p>
                <span className="border border-[var(--warn)]/50 px-1.5 py-0.5 font-mono-readout text-[0.6rem] text-[var(--warn)]">
                  NOT SCADA
                </span>
              </div>
              <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
                SolarisPredict-SL
              </h1>
              <p className="font-body mt-1 max-w-2xl text-xs leading-relaxed text-[var(--ink-muted)] sm:text-sm">
                Net-load co-pilot: rooftop ~1.9 GW is system-scale. Ramp oil
                down, hold hydro for TOU peak — don&apos;t curtail solar by
                default. Estimates from weather + published patterns.
              </p>
            </div>
            <div className="shrink-0 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 sm:text-right">
              <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
                ZONE
              </p>
              <p className="font-display text-lg font-semibold text-[var(--solar)] sm:text-xl">
                {zoneLabel.toUpperCase()}
              </p>
              <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                {horizonLabel} · Asia/Colombo
              </p>
            </div>
          </div>
        </header>

        <nav
          aria-label="Dashboard sections"
          className="mb-3 flex flex-wrap gap-0 border border-[var(--line)] bg-[var(--panel)]"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "font-mono-readout border-r border-[var(--line)] px-3 py-2 text-[0.7rem] font-medium uppercase tracking-wide outline-none last:border-r-0",
                  "focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-inset",
                  active
                    ? "bg-[var(--mist)] text-[var(--solar)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--mist)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {(tab === "forecast" || tab === "advisory" || tab === "map") && (
          <div className="mb-4 sm:mb-5">
            <ZoneSelector value={zone} onChange={setZone} />
          </div>
        )}

        {tab === "forecast" && (
          <div className="space-y-3">
            <StateOfGridStrip baseline={ceb} />

            <DispatchAdvisoryPanel
              advisory={advisory}
              loading={advisoryLoading}
            />

            <ResearchEvidence
              evidence={evidence}
              calendar={calendar}
              forecast={forecast}
              weatherRegime={forecast?.weather_regime}
              eveningRampMw={forecast?.evening_ramp_mw}
              evidenceLoading={loading}
            />

            <LiveStatCards stats={stats} loading={statsLoading} />
            {stats?.zone_estimated?.note ? (
              <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                {stats.zone_estimated.note}
              </p>
            ) : null}

            <section
              aria-label="Net load forecast"
              aria-busy={loading}
              className="animate-rise scada-panel"
            >
              <div className="scada-panel-header">
                <div className="min-w-0">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
                    Zone net-load forecast
                    {loading ? (
                      <span className="ml-2 font-mono-readout text-[0.65rem] font-normal text-[var(--warn)]">
                        UPDATING
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
                    {zoneLabel} only · EST MW · not national peak (
                    {ceb
                      ? `Digest night Pmax ${ceb.night_max_demand_mw.toLocaleString()} MW`
                      : "~2,700–2,900 MW"}
                    )
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <HorizonSelector
                    value={horizonHours}
                    onChange={setHorizonHours}
                    disabled={loading}
                  />
                  <ForecastSourceBadges />
                </div>
              </div>
              <div className="px-2 py-2 sm:px-3 sm:py-3">

              {error ? (
                <div
                  role="alert"
                  className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-4 py-10 text-center"
                >
                  <p className="font-display text-sm font-semibold text-[var(--risk)]">
                    Could not load forecast
                  </p>
                  <p className="font-body max-w-md text-sm text-[var(--ink-muted)]">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadZoneData(zone, horizonHours)}
                    className="font-display border-2 border-[var(--demand)] bg-[var(--demand)] px-4 py-2 text-xs font-semibold tracking-wide text-[var(--sun-wash)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar)]"
                  >
                    Retry
                  </button>
                </div>
              ) : loading && !forecast ? (
                <div className="flex min-h-[280px] items-center justify-center py-10">
                  <p className="font-body animate-pulse text-sm text-[var(--ink-muted)]">
                    Fetching Open-Meteo + solar model…
                  </p>
                </div>
              ) : (
                <div className={loading ? "opacity-55 transition-opacity" : ""}>
                  <NetLoadChart forecast={forecast} />
                </div>
              )}

              <p className="mt-2 font-mono-readout text-[0.65rem] leading-relaxed text-[var(--ink-muted)]">
                Zone-scale calendar demand (not CEB SCC) · horizon {horizonLabel}{" "}
                · brush to zoom · TOU 18:30–22:30 · hosting risk &lt;15% zone peak
                · gold = solar P10–P90 · green = net load · blue = demand
              </p>
              </div>
            </section>

            <HostingRiskBanner forecast={forecast} />
            <EvidenceDrawer />
            <SectorBreakdown stats={stats} />

            <div className="grid gap-4 lg:grid-cols-2">
              <BacktestAccuracyPanel metrics={metrics} />
              <FeatureImportancePanel metrics={metrics} />
            </div>
          </div>
        )}

        {tab === "map" && (
          <div className="space-y-4">
            <TimelineSlider
              points={points}
              hourIndex={safeHourIndex}
              onHourIndexChange={setHourIndex}
              playing={playing}
              onPlayingChange={setPlaying}
              loading={loading}
              zoneLabel={zoneLabel}
              horizonLabel={horizonLabel}
            />
            <MapPanel
              rooftopPoints={rooftopPoints}
              showRooftop={showRooftop}
              onToggleRooftop={(v) => void handleRooftopToggle(v)}
              rooftopLoading={rooftopLoading}
              dispatchHighlight={dispatchHighlight}
              showFpv={showFpv}
              onToggleFpv={setShowFpv}
              fpvSeason={fpvSeason}
              plantOutputs={plantOutputs}
              solarIntensity={solarIntensity}
            />
            <MapAdvancedStats
              forecast={forecast}
              point={selectedPoint}
              hourIndex={safeHourIndex}
              plants={plants}
              plantOutputs={plantOutputs}
              loading={loading}
            />
            <p className="font-body text-xs text-[var(--ink-muted)]">
              Playback drives marker size from zone forecast + merit-order
              estimates (not SCADA). Rooftop layer sums to CEB Digest 2025
              (~1,935 MW) as synthetic points. Square markers = iPURSE 2025 FPV
              candidates (potential, not built).
            </p>
          </div>
        )}

        {tab === "advisory" && (
          <div className="space-y-5">
            <DispatchAdvisoryPanel
              advisory={advisory}
              loading={advisoryLoading}
            />
            {error ? (
              <p className="font-body text-sm text-[var(--risk)]">{error}</p>
            ) : null}
          </div>
        )}

        {tab === "methodology" && (
          <div className="scada-panel px-4 py-4 sm:px-5">
            <MethodologyPanel alwaysOpen />
          </div>
        )}
      </div>
    </main>
  );
}
