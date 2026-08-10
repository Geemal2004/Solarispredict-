"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ReplayDay, ReplayValidationMetrics } from "@/lib/api";

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-LK", { maximumFractionDigits: digits });
}

function fmtMin(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)} min`;
}

function MetricCard({
  label,
  value,
  sub,
  accent = "var(--foreground)",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <li className="border border-[var(--line)] px-3 py-2">
      <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">{label}</p>
      <p className="font-display text-lg font-semibold" style={{ color: accent }}>
        {value}
      </p>
      {sub ? (
        <p className="font-body mt-0.5 text-[0.6rem] text-[var(--ink-muted)]">{sub}</p>
      ) : null}
    </li>
  );
}

function ValidationBlock({
  title,
  metrics,
  baseline,
  holdoutMae,
}: {
  title: string;
  metrics: ReplayValidationMetrics;
  baseline?: ReplayValidationMetrics;
  holdoutMae?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono-readout px-3 pt-2 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {title}
      </p>
      <ul className="grid gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Demand MAE"
          value={`${fmt(metrics.demand_mae_mw, 1)} MW`}
          sub={
            baseline?.demand_mae_mw != null && metrics.demand_mae_mw != null
              ? `vs ${fmt(baseline.demand_mae_mw, 1)} MW persistence`
              : holdoutMae != null
                ? `holdout ref. ${fmt(holdoutMae, 1)} MW`
                : undefined
          }
          accent="var(--demand)"
        />
        <MetricCard
          label="Net-load MAE"
          value={`${fmt(metrics.net_load_mae_mw, 1)} MW`}
          sub={
            baseline?.net_load_mae_mw != null && metrics.net_load_mae_mw != null
              ? `vs ${fmt(baseline.net_load_mae_mw, 1)} MW persistence`
              : undefined
          }
          accent="var(--ok)"
        />
        <MetricCard
          label="Peak timing error"
          value={fmtMin(metrics.peak_timing_error_min)}
          sub="Max demand timestamp vs forecast"
          accent="var(--solar)"
        />
        <MetricCard
          label="Ramp timing error"
          value={fmtMin(metrics.ramp_timing_error_min)}
          sub={
            metrics.evening_ramp_actual_mw != null
              ? `Evening ramp est. ${fmt(metrics.evening_ramp_actual_mw, 0)} MW actual`
              : "Steepest 17:00–21:00 demand step"
          }
          accent="var(--warn)"
        />
      </ul>
    </div>
  );
}

export function HistoricalReplayPanel({
  dates,
  day,
  replay,
  loading,
  onDayChange,
}: {
  dates: string[];
  day: string;
  replay: ReplayDay | null;
  loading: boolean;
  onDayChange: (day: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const points = useMemo(() => replay?.points ?? [], [replay?.points]);
  const safeIndex = Math.min(index, Math.max(0, points.length - 1));
  const selected = points[safeIndex] ?? null;
  const validation = replay?.validation;

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [day, replay?.date]);

  useEffect(() => {
    if (!playing || points.length === 0) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= points.length) {
          setPlaying(false);
          return points.length - 1;
        }
        return next;
      });
    }, 280);
    return () => window.clearInterval(id);
  }, [playing, points.length]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        t: p.timestamp.slice(11, 16),
        demand: p.demand_mw,
        modelDemand: p.forecast_model?.demand_mw ?? null,
        persistDemand: p.forecast_persistence?.demand_mw ?? null,
        solarEst: p.solar_estimate_mw,
        modelSolar: p.forecast_model?.solar_mw ?? null,
        persistSolar: p.forecast_persistence?.solar_mw ?? null,
        net: p.net_load_mw,
        modelNet: p.forecast_model?.net_load_mw ?? null,
        coal: p.coal_mw,
        hydro: p.major_hydro_mw + p.mini_hydro_mw,
        oil: p.oil_mw,
        wind: p.wind_mw,
      })),
    [points]
  );

  const modelFc = selected?.forecast_model;
  const demandErr =
    modelFc?.demand_mw != null && selected
      ? Math.abs(selected.demand_mw - modelFc.demand_mw)
      : null;

  return (
    <div className="space-y-3">
      <section className="scada-panel">
        <div className="scada-panel-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Historical replay · official NSO actuals
            </p>
            <h2 className="font-display text-lg font-semibold">
              Forecast vs actual · operating day
            </h2>
          </div>
          <label className="font-mono-readout text-[0.7rem] text-[var(--ink-muted)]">
            REPORT DATE
            <input
              type="date"
              value={day}
              min={dates[0]}
              max={dates[dates.length - 1]}
              onChange={(e) => onDayChange(e.target.value)}
              className="ml-2 border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--solar)]"
            />
          </label>
        </div>

        <div className="grid gap-2 border-b border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">MAX DEMAND</p>
            <p className="font-display text-xl font-semibold">
              {fmt(replay?.summary.max_demand_mw)} MW
            </p>
          </div>
          <div>
            <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
              PEAK SOLAR ESTIMATE
            </p>
            <p className="font-display text-xl font-semibold text-[var(--solar)]">
              {fmt(replay?.summary.max_solar_estimate_mw)} MW
            </p>
          </div>
          <div>
            <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
              EVENING RAMP
            </p>
            <p className="font-display text-xl font-semibold">
              {fmt(replay?.summary.evening_ramp_mw)} MW
            </p>
          </div>
          <div>
            <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
              SOLAR VISIBILITY
            </p>
            <p className="font-display text-xl font-semibold">
              {fmt(replay?.summary.solar_visibility_pct, 1)}%
            </p>
          </div>
        </div>

        <div className="h-[320px] w-full p-2">
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
                  formatter={(v, name) => [
                    v == null ? "—" : `${Number(v).toFixed(0)} MW`,
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="coal"
                  stackId="mix"
                  fill="#6b5b4b"
                  stroke="none"
                  name="Coal (actual)"
                />
                <Area
                  type="monotone"
                  dataKey="hydro"
                  stackId="mix"
                  fill="#3d6b8a"
                  stroke="none"
                  name="Hydro (actual)"
                />
                <Area
                  type="monotone"
                  dataKey="oil"
                  stackId="mix"
                  fill="#8a5a3d"
                  stroke="none"
                  name="Oil (actual)"
                />
                <Area
                  type="monotone"
                  dataKey="wind"
                  stackId="mix"
                  fill="#4a8a6b"
                  stroke="none"
                  name="Wind (actual)"
                />
                <Line
                  type="monotone"
                  dataKey="demand"
                  stroke="var(--demand)"
                  dot={false}
                  strokeWidth={2.5}
                  name="Demand actual"
                />
                <Line
                  type="monotone"
                  dataKey="modelDemand"
                  stroke="var(--demand)"
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  name="Demand forecast (model)"
                />
                <Line
                  type="monotone"
                  dataKey="persistDemand"
                  stroke="var(--demand)"
                  dot={false}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  strokeOpacity={0.45}
                  name="Demand (24h persist.)"
                />
                <Line
                  type="monotone"
                  dataKey="solarEst"
                  stroke="var(--solar)"
                  dot={false}
                  strokeWidth={2}
                  name="Solar est. actual"
                />
                <Line
                  type="monotone"
                  dataKey="modelSolar"
                  stroke="var(--solar)"
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  name="Solar forecast (model)"
                />
                <Line
                  type="monotone"
                  dataKey="modelNet"
                  stroke="var(--ok)"
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  name="Net load forecast (model)"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--ok)"
                  dot={false}
                  strokeWidth={2}
                  name="Net load actual"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
              {loading ? "Loading replay…" : "Select a date in the archive"}
            </div>
          )}
        </div>

        {points.length > 0 ? (
          <div className="border-t border-[var(--line)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setPlaying(!playing)}
                className="shrink-0 border border-[var(--line)] bg-[var(--mist)] px-3 py-1.5 font-mono-readout text-[0.7rem] uppercase text-[var(--solar)]"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, points.length - 1)}
                value={safeIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setIndex(Number(e.target.value));
                }}
                className="w-full accent-[var(--solar)]"
              />
              <span className="font-mono-readout shrink-0 text-[0.7rem] text-[var(--ink-muted)]">
                {selected?.timestamp ?? day}
              </span>
            </div>
            {selected ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 font-mono-readout text-[0.7rem]">
                <div>
                  <span className="text-[var(--ink-muted)]">Actual demand </span>
                  {fmt(selected.demand_mw)} MW
                </div>
                <div>
                  <span className="text-[var(--ink-muted)]">Model fc </span>
                  {fmt(modelFc?.demand_mw ?? null)} MW
                </div>
                <div>
                  <span className="text-[var(--ink-muted)]">Error </span>
                  {fmt(demandErr, 1)} MW
                </div>
                <div>
                  <span className="text-[var(--ink-muted)]">Solar est. </span>
                  {fmt(selected.solar_estimate_mw)} MW
                </div>
                <div>
                  <span className="text-[var(--ink-muted)]">Net load </span>
                  {fmt(selected.net_load_mw)} MW
                </div>
                <div>
                  <span className="text-[var(--ink-muted)]">Model net </span>
                  {fmt(modelFc?.net_load_mw ?? null)} MW
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {validation ? (
        <section className="scada-panel">
          <div className="scada-panel-header">
            <div>
              <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                Forecast validation · replay day
              </p>
              <p className="font-body mt-1 text-xs text-[var(--ink-muted)]">
                {validation.method}
              </p>
            </div>
          </div>
          <ValidationBlock
            title="XGBoost model (NSO-trained)"
            metrics={validation.model}
            baseline={validation.persistence}
            holdoutMae={validation.holdout_reference?.demand_xgb?.mae_mw}
          />
          <ValidationBlock
            title="24h persistence baseline"
            metrics={validation.persistence}
          />
          <p className="border-t border-[var(--line)] px-3 py-2 font-body text-[0.65rem] leading-relaxed text-[var(--ink-muted)]">
            Peak timing = |t(max demand actual) − t(max demand forecast)|. Ramp timing =
            |t(steepest evening demand step actual) − t(forecast step)| on 17:00–21:00
            intervals. Validated on official NSO 15-minute archive — not synthetic zone data.
          </p>
        </section>
      ) : null}

      {replay?.peaks && Object.keys(replay.peaks).length > 0 ? (
        <section className="scada-panel">
          <div className="scada-panel-header">
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              Published peaks
            </p>
          </div>
          <ul className="grid gap-2 p-3 sm:grid-cols-3 font-mono-readout text-[0.75rem]">
            {Object.entries(replay.peaks).map(([k, v]) => (
              <li key={k} className="border border-[var(--line)] px-3 py-2">
                <p className="text-[var(--ink-muted)] uppercase">{k.replace("_", " ")}</p>
                <p className="font-display text-lg font-semibold">{fmt(v.demand_mw)} MW</p>
                <p className="text-[var(--ink-muted)]">{v.timestamp}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
