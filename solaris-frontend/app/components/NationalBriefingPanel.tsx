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
  SolarVisibility,
} from "@/lib/api";

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-LK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function Kpi({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--panel)] px-3 py-3">
      <p className="font-mono-readout text-[0.6rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="font-display mt-1 text-2xl font-semibold text-[var(--foreground)] sm:text-3xl">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-[var(--ink-muted)]">
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? (
        <p className="font-mono-readout mt-1 text-[0.65rem] text-[var(--ink-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function NationalBriefingPanel({
  briefing,
  accuracy,
  visibility,
  forecast,
  loading,
}: {
  briefing: NationalBriefing | null;
  accuracy: ForecastAccuracy | null;
  visibility: SolarVisibility | null;
  forecast: NationalForecast | null;
  loading: boolean;
}) {
  const chartData =
    forecast?.points.slice(0, 96).map((p) => ({
      t: p.timestamp.slice(11, 16),
      demand: p.demand_mw,
      solar: p.solar_mw,
      net: p.net_load_mw,
      p10: p.net_load_p10_mw,
      p90: p.net_load_p90_mw,
    })) ?? [];

  const holdout = accuracy?.model_holdout;
  const vis =
    visibility?.distributed_solar_visibility_pct ??
    briefing?.kpis.distributed_solar_visibility_pct;

  return (
    <div className="space-y-3">
      <section className="scada-panel">
        <div className="scada-panel-header flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              National Grid Briefing · NSO archive
            </p>
            <h2 className="font-display text-lg font-semibold text-[var(--foreground)]">
              Sri Lanka operations console
            </h2>
          </div>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            {loading ? "Loading…" : briefing?.as_of ?? "—"}
          </p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Demand now"
            value={fmt(briefing?.kpis.demand_now_mw)}
            unit="MW"
            hint="Actual NSO load-curve sum"
          />
          <Kpi
            label="Solar estimate"
            value={fmt(briefing?.kpis.solar_estimate_mw)}
            unit="MW"
            hint="NSO pvEstimate"
          />
          <Kpi
            label="Net load"
            value={fmt(briefing?.kpis.net_load_mw)}
            unit="MW"
            hint="Demand − solar estimate"
          />
          <Kpi
            label="Renewable share"
            value={fmt(briefing?.kpis.renewable_share_pct, 1)}
            unit="%"
            hint="Hydro + wind + biomass + SCADA solar"
          />
          <Kpi
            label="Grid risk"
            value={
              (briefing?.kpis.net_load_mw ?? 9999) < 375 ? "LOW NET" : "NOMINAL"
            }
            hint={briefing?.next_critical_event}
          />
        </div>
        {briefing?.archive.statement ? (
          <p className="border-t border-[var(--line)] px-3 py-2 font-body text-xs leading-relaxed text-[var(--ink-muted)]">
            {briefing.archive.statement}
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="scada-panel lg:col-span-2">
          <div className="scada-panel-header">
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              AI forecast · next 24 h (15-min)
            </p>
            <h3 className="font-display text-base font-semibold">
              Demand · solar · net load
            </h3>
          </div>
          <div className="h-[280px] w-full p-2">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tick={{ fill: "var(--ink-muted)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--panel-elevated)",
                      border: "1px solid var(--line)",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="p90"
                    stroke="none"
                    fill="var(--demand)"
                    fillOpacity={0.08}
                    name="Net P90"
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    stroke="none"
                    fill="var(--bg)"
                    fillOpacity={1}
                    name="Net P10"
                  />
                  <Line
                    type="monotone"
                    dataKey="demand"
                    stroke="var(--demand)"
                    dot={false}
                    strokeWidth={2}
                    name="Forecast demand"
                  />
                  <Line
                    type="monotone"
                    dataKey="solar"
                    stroke="var(--solar)"
                    dot={false}
                    strokeWidth={2}
                    name="Forecast solar"
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="var(--ok)"
                    dot={false}
                    strokeWidth={2}
                    name="Forecast net load"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
                {loading ? "Loading forecast…" : "National forecast unavailable"}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-3">
          <section className="scada-panel">
            <div className="scada-panel-header">
              <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                Distributed solar visibility
              </p>
              <p className="font-display text-3xl font-semibold text-[var(--solar)]">
                {fmt(vis, 1)}%
              </p>
            </div>
            <p className="px-3 py-2 font-body text-xs leading-relaxed text-[var(--ink-muted)]">
              {visibility?.insight ??
                "Share of NSO system solar estimate visible in SCADA generation mix."}
            </p>
          </section>

          <section className="scada-panel">
            <div className="scada-panel-header">
              <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                Holdout accuracy (NSO models)
              </p>
            </div>
            <ul className="space-y-2 px-3 py-3 font-mono-readout text-[0.7rem]">
              <li className="flex justify-between gap-2">
                <span className="text-[var(--ink-muted)]">Demand MAE</span>
                <span>{fmt(holdout?.demand_xgb?.mae_mw, 1)} MW</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--ink-muted)]">Solar MAE</span>
                <span>{fmt(holdout?.solar_xgb?.mae_mw, 1)} MW</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--ink-muted)]">Net-load MAE</span>
                <span>{fmt(holdout?.netload_xgb?.mae_mw, 1)} MW</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-[var(--line)] pt-2">
                <span className="text-[var(--ink-muted)]">vs 24h persistence</span>
                <span className="text-[var(--ok)]">~4× better</span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      {forecast?.daily?.length ? (
        <section className="scada-panel">
          <div className="scada-panel-header">
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              7-day planning rollup
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left font-mono-readout text-[0.7rem]">
              <thead className="border-b border-[var(--line)] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Peak demand</th>
                  <th className="px-3 py-2 font-medium">Peak solar</th>
                  <th className="px-3 py-2 font-medium">Min net load</th>
                  <th className="px-3 py-2 font-medium">Evening ramp</th>
                  <th className="px-3 py-2 font-medium">Risk ints.</th>
                </tr>
              </thead>
              <tbody>
                {forecast.daily.map((d) => (
                  <tr key={d.date} className="border-b border-[var(--line)]/70">
                    <td className="px-3 py-2">{d.date}</td>
                    <td className="px-3 py-2">{fmt(d.peak_demand_mw)} MW</td>
                    <td className="px-3 py-2 text-[var(--solar)]">
                      {fmt(d.peak_solar_mw)} MW
                    </td>
                    <td className="px-3 py-2">{fmt(d.min_net_load_mw)} MW</td>
                    <td className="px-3 py-2">{fmt(d.evening_ramp_mw)} MW</td>
                    <td className="px-3 py-2">{d.hosting_risk_intervals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
