"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ForecastAccuracy,
  NationalBriefing,
  NationalForecast,
  NationalWeatherAnomaly,
  SolarVisibility,
} from "@/lib/api";
import {
  buildOpsTimeline,
  buildSystemHealth,
  computeEveningRampStress,
  computeForecastRevision,
  computeNetLoadThresholdStress,
  nextOpsTimelineEvent,
  operationalRiskLabel,
  operationalRiskLevel,
  type ForecastRevision,
} from "@/lib/opsAnalytics";

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-LK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function Level1Hero({
  briefing,
  riskLabel,
  nextEvent,
}: {
  briefing: NationalBriefing | null;
  riskLabel: string;
  nextEvent: string;
}) {
  const net = briefing?.kpis.net_load_mw ?? 0;

  return (
    <section className="border-2 border-[var(--line)] bg-[var(--panel-elevated)]">
      <div className="grid gap-0 lg:grid-cols-3">
        <div className="border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r">
          <p className="font-mono-readout text-[0.6rem] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Grid risk
          </p>
          <p className="font-display mt-1 text-3xl font-semibold text-[var(--risk)] sm:text-4xl">
            {riskLabel}
          </p>
        </div>
        <div className="border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r">
          <p className="font-mono-readout text-[0.6rem] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Net load
          </p>
          <p className="font-display mt-1 text-3xl font-semibold text-[var(--ok)] sm:text-4xl">
            {fmt(net)} <span className="text-lg text-[var(--ink-muted)]">MW</span>
          </p>
        </div>
        <div className="p-4">
          <p className="font-mono-readout text-[0.6rem] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Next critical event
          </p>
          <p className="font-body mt-2 text-sm leading-relaxed text-[var(--foreground)]">
            {nextEvent}
          </p>
        </div>
      </div>
    </section>
  );
}

function Level2Strip({ briefing }: { briefing: NationalBriefing | null }) {
  if (!briefing) return null;
  const k = briefing.kpis;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {[
        { label: "Demand", value: fmt(k.demand_now_mw), unit: "MW", color: "var(--demand)" },
        { label: "Solar estimate", value: fmt(k.solar_estimate_mw), unit: "MW", color: "var(--solar)" },
        { label: "Renewable share", value: fmt(k.renewable_share_pct, 1), unit: "%", color: "var(--monsoon)" },
      ].map((item) => (
        <div key={item.label} className="border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="font-mono-readout text-[0.6rem] uppercase tracking-wide text-[var(--ink-muted)]">
            {item.label}
          </p>
          <p className="font-display text-xl font-semibold" style={{ color: item.color }}>
            {item.value}
            <span className="ml-1 text-xs text-[var(--ink-muted)]">{item.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function OpsTimeline({ events }: { events: ReturnType<typeof buildOpsTimeline> }) {
  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <h3 className="font-display text-sm font-semibold">National operations timeline · next 24 h</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left font-mono-readout text-[0.72rem]">
          <thead className="border-b border-[var(--line)] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Grid event</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.time}-${i}`} className="border-b border-[var(--line)]/60">
                <td className="px-3 py-2 text-[var(--solar)]">{e.time}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      e.severity === "action"
                        ? "text-[var(--risk)]"
                        : e.severity === "watch"
                          ? "text-[var(--warn)]"
                          : "text-[var(--foreground)]"
                    }
                  >
                    {e.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fmtDelta(n: number | null | undefined, unit: string): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}${unit}`;
}

function WeatherClimatologyPanel({
  anomaly,
}: {
  anomaly: NationalWeatherAnomaly | null;
}) {
  if (!anomaly?.zones.length) return null;

  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide">
          Weather vs climatology · next {anomaly.hours} h
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left font-mono-readout text-[0.72rem]">
          <thead className="border-b border-[var(--line)] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">Cloud (fcst / norm)</th>
              <th className="px-3 py-2 font-medium">GHI (fcst / norm)</th>
              <th className="px-3 py-2 font-medium">Temp (fcst / norm)</th>
              <th className="px-3 py-2 font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {anomaly.zones.map((z) => {
              const s = z.summary;
              return (
                <tr key={z.zone} className="border-b border-[var(--line)]/60">
                  <td className="px-3 py-2 capitalize text-[var(--foreground)]">{z.label}</td>
                  <td className="px-3 py-2">
                    {fmt(s.cloud_forecast_pct, 0)}% / {fmt(s.cloud_climatology_pct, 0)}%
                    <span className="ml-1 text-[var(--ink-muted)]">
                      ({fmtDelta(s.cloud_delta_pp, " pp")})
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {fmt(s.ghi_forecast_wm2, 0)} / {fmt(s.ghi_climatology_wm2, 0)} W/m²
                    <span className="ml-1 text-[var(--ink-muted)]">
                      ({fmtDelta(s.ghi_delta_pct, "%")})
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {fmt(s.temp_forecast_c, 1)} / {fmt(s.temp_climatology_c, 1)} °C
                    <span className="ml-1 text-[var(--ink-muted)]">
                      ({fmtDelta(s.temp_delta_c, "°C")})
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {z.flags.length ? (
                      <span className="text-[var(--warn)]">{z.flags.join(", ")}</span>
                    ) : (
                      <span className="text-[var(--ok)]">within norm</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--line)] px-3 py-2 font-body text-[0.65rem] leading-relaxed text-[var(--ink-muted)]">
        {anomaly.method}. National GHI deviation (capacity-weighted):{" "}
        {fmtDelta(anomaly.national.ghi_delta_pct, "%")}; mean cloud deviation:{" "}
        {fmtDelta(anomaly.national.cloud_delta_pp, " pp")}.
      </p>
    </section>
  );
}

function ForecastRevisionBlock({ rev }: { rev: ForecastRevision | null }) {
  if (!rev) return null;
  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <p className="font-mono-readout text-[0.65rem] uppercase tracking-wide text-[var(--ink-muted)]">
          Forecast revision · {rev.sinceLabel}
        </p>
      </div>
      <ul className="grid gap-2 p-3 sm:grid-cols-3 font-mono-readout text-[0.75rem]">
        <li className="border border-[var(--line)] px-3 py-2">
          <span className="text-[var(--ink-muted)]">Peak demand</span>
          <p className="font-display text-lg">{rev.peakDemandMw >= 0 ? "+" : ""}{Math.round(rev.peakDemandMw)} MW</p>
        </li>
        <li className="border border-[var(--line)] px-3 py-2">
          <span className="text-[var(--ink-muted)]">Peak solar</span>
          <p className="font-display text-lg">{rev.peakSolarMw >= 0 ? "+" : ""}{Math.round(rev.peakSolarMw)} MW</p>
        </li>
        <li className="border border-[var(--line)] px-3 py-2">
          <span className="text-[var(--ink-muted)]">Evening ramp</span>
          <p className="font-display text-lg">{rev.eveningRampMw >= 0 ? "+" : ""}{Math.round(rev.eveningRampMw)} MW</p>
        </li>
      </ul>
    </section>
  );
}

function SystemHealthTable({ rows }: { rows: ReturnType<typeof buildSystemHealth> }) {
  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide">System health</h3>
      </div>
      <table className="w-full font-mono-readout text-[0.72rem]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric} className="border-t border-[var(--line)]">
              <td className="px-3 py-2 text-[var(--ink-muted)]">{r.metric}</td>
              <td className="px-3 py-2 font-medium text-[var(--foreground)]">{r.status}</td>
              {r.detail ? (
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] sm:table-cell">{r.detail}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function OperationsConsole({
  briefing,
  accuracy,
  visibility,
  forecast,
  previousForecast,
  weatherAnomaly,
  loading,
}: {
  briefing: NationalBriefing | null;
  accuracy: ForecastAccuracy | null;
  visibility: SolarVisibility | null;
  forecast: NationalForecast | null;
  previousForecast?: NationalForecast | null;
  weatherAnomaly?: NationalWeatherAnomaly | null;
  loading: boolean;
}) {
  const threshold = forecast?.risk_threshold_mw ?? 375;
  const riskIntervals = forecast?.daily?.[0]?.hosting_risk_intervals ?? 0;
  const risk = operationalRiskLevel(
    briefing?.kpis.net_load_mw ?? 9999,
    threshold,
    riskIntervals
  );
  const riskLabel = operationalRiskLabel(risk);
  const timeline = buildOpsTimeline(forecast);
  const nextEvent = (() => {
    const evt = nextOpsTimelineEvent(forecast, briefing?.as_of ?? null);
    return evt ? `${evt.time} · ${evt.label}` : "Monitoring grid conditions";
  })();
  const rampStress = computeEveningRampStress(forecast);
  const thresholdStress = computeNetLoadThresholdStress(forecast);
  const revision = computeForecastRevision(forecast, previousForecast ?? null);
  const health = buildSystemHealth(briefing, accuracy, visibility, forecast);

  const chartData =
    forecast?.points.slice(0, 96).map((p) => ({
      t: p.timestamp.slice(11, 16),
      demand: p.demand_mw,
      solar: p.solar_mw,
      net: p.net_load_mw,
      p50: p.net_load_p50_mw ?? p.net_load_mw,
      p10base: p.net_load_p10_mw,
      pBand:
        p.net_load_p10_mw != null && p.net_load_p90_mw != null
          ? Math.max(0, p.net_load_p90_mw - p.net_load_p10_mw)
          : undefined,
      prob: p.prob_below_threshold_pct,
    })) ?? [];

  return (
    <div className="space-y-3">
      <Level1Hero briefing={briefing} riskLabel={riskLabel} nextEvent={nextEvent} />
      <Level2Strip briefing={briefing} />

      <div className="grid gap-3 lg:grid-cols-2">
        <OpsTimeline events={timeline} />
        <ForecastRevisionBlock rev={revision} />
      </div>

      <section className="scada-panel">
        <div className="scada-panel-header flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-wide text-[var(--ink-muted)]">
              National forecast · P10 / P50 / P90
            </p>
            <h3 className="font-display text-base font-semibold">Demand · solar · net load</h3>
          </div>
          <div className="text-right">
            <p className="font-mono-readout text-[0.7rem] text-[var(--warn)]">
              P(net &lt; {fmt(thresholdStress.thresholdMw, 0)} MW):{" "}
              {thresholdStress.maxProbPct}% max · @ {thresholdStress.peakTime}
            </p>
            <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
              Evening-ramp stress: {rampStress.probabilityPct}% prob. &gt;{" "}
              {rampStress.thresholdMw} MW
            </p>
          </div>
        </div>
        <div className="h-[260px] w-full p-2">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: "var(--ink-muted)", fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "var(--panel-elevated)", border: "1px solid var(--line)", fontSize: 12 }} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="p10base"
                  stackId="netband"
                  stroke="none"
                  fill="transparent"
                  legendType="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="pBand"
                  stackId="netband"
                  stroke="none"
                  fill="var(--ok)"
                  fillOpacity={0.18}
                  name="Net load P10–P90"
                  isAnimationActive={false}
                />
                <Line type="monotone" dataKey="demand" stroke="var(--demand)" dot={false} strokeWidth={1.5} name="Demand P50" />
                <Line type="monotone" dataKey="solar" stroke="var(--solar)" dot={false} strokeWidth={1.5} name="Solar P50" />
                <Line type="monotone" dataKey="p50" stroke="var(--ok)" dot={false} strokeWidth={2.5} name="Net load P50" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
              {loading ? "Loading forecast…" : "Forecast unavailable"}
            </div>
          )}
        </div>
        {forecast?.uncertainty ? (
          <p className="border-t border-[var(--line)] px-3 py-2 font-body text-[0.65rem] leading-relaxed text-[var(--ink-muted)]">
            {forecast.uncertainty.method}. Residual pool:{" "}
            {forecast.uncertainty.n_residuals.toLocaleString()} holdout intervals (
            {forecast.uncertainty.holdout_days}d).
          </p>
        ) : null}
      </section>

      <WeatherClimatologyPanel anomaly={weatherAnomaly ?? null} />

      <details className="scada-panel group">
        <summary className="scada-panel-header cursor-pointer list-none font-mono-readout text-[0.65rem] uppercase tracking-wide text-[var(--ink-muted)]">
          Level 3 · Accuracy · visibility · archive
        </summary>
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          <SystemHealthTable rows={health} />
          <div className="space-y-2 font-mono-readout text-[0.7rem]">
            <p>Demand MAE holdout: {fmt(accuracy?.model_holdout?.demand_xgb?.mae_mw, 1)} MW</p>
            <p>Solar MAE holdout: {fmt(accuracy?.model_holdout?.solar_xgb?.mae_mw, 1)} MW</p>
            <p>Net-load MAE holdout: {fmt(accuracy?.model_holdout?.netload_xgb?.mae_mw, 1)} MW</p>
            <p>Solar visibility: {fmt(visibility?.distributed_solar_visibility_pct ?? briefing?.kpis.distributed_solar_visibility_pct, 1)}%</p>
            {briefing?.archive.statement ? (
              <p className="font-body text-xs leading-relaxed text-[var(--ink-muted)]">{briefing.archive.statement}</p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
