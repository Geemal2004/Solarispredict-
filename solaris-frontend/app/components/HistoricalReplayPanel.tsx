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
import type { ReplayDay } from "@/lib/api";

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-LK", { maximumFractionDigits: digits });
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
  const points = replay?.points ?? [];
  const safeIndex = Math.min(index, Math.max(0, points.length - 1));
  const selected = points[safeIndex] ?? null;

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
      points.map((p, i) => ({
        t: p.timestamp.slice(11, 16),
        demand: p.demand_mw,
        solarEst: p.solar_estimate_mw,
        solarScada: p.solar_scada_mw,
        net: p.net_load_mw,
        coal: p.coal_mw,
        hydro: p.major_hydro_mw + p.mini_hydro_mw,
        oil: p.oil_mw,
        wind: p.wind_mw,
        active: i === safeIndex ? p.demand_mw : null,
      })),
    [points, safeIndex]
  );

  return (
    <div className="space-y-3">
      <section className="scada-panel">
        <div className="scada-panel-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Historical replay · official NSO actuals
            </p>
            <h2 className="font-display text-lg font-semibold">
              Reconstruct the operating day
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
            <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
              MAX DEMAND
            </p>
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

        <div className="h-[300px] w-full p-2">
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
                  dataKey="coal"
                  stackId="mix"
                  fill="#6b5b4b"
                  stroke="none"
                  name="Coal"
                />
                <Area
                  type="monotone"
                  dataKey="hydro"
                  stackId="mix"
                  fill="#3d6b8a"
                  stroke="none"
                  name="Hydro"
                />
                <Area
                  type="monotone"
                  dataKey="oil"
                  stackId="mix"
                  fill="#8a5a3d"
                  stroke="none"
                  name="Oil"
                />
                <Area
                  type="monotone"
                  dataKey="wind"
                  stackId="mix"
                  fill="#4a8a6b"
                  stroke="none"
                  name="Wind"
                />
                <Line
                  type="monotone"
                  dataKey="demand"
                  stroke="var(--demand)"
                  dot={false}
                  strokeWidth={2}
                  name="Demand"
                />
                <Line
                  type="monotone"
                  dataKey="solarEst"
                  stroke="var(--solar)"
                  dot={false}
                  strokeWidth={2}
                  name="Solar estimate"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--ok)"
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  name="Net load"
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
              <div className="mt-3 grid gap-2 sm:grid-cols-4 font-mono-readout text-[0.7rem]">
                <div>
                  <span className="text-[var(--ink-muted)]">Demand </span>
                  {fmt(selected.demand_mw)} MW
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
                  <span className="text-[var(--ink-muted)]">Coal </span>
                  {fmt(selected.coal_mw)} MW
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

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
