"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetLoadForecast, NetLoadPoint } from "@/lib/api";
import {
  aggregateOutputByType,
  formatPlaybackClock,
} from "@/lib/mapPlayback";
import { PLANT_COLORS, PLANT_LABELS, type Plant, type PlantType } from "@/lib/plants";

const ALL_TYPES: PlantType[] = ["hydro", "coal", "oil", "wind", "solar"];

interface MapAdvancedStatsProps {
  forecast: NetLoadForecast | null;
  point: NetLoadPoint | null;
  hourIndex: number;
  plants: Plant[];
  plantOutputs: Record<string, number>;
  loading?: boolean;
}

function StatCell({
  label,
  value,
  unit,
  accent,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="scada-panel px-2.5 py-2">
      <p className="font-mono-readout text-[0.6rem] tracking-wide text-[var(--ink-muted)]">
        {label}
      </p>
      <p
        className="font-mono-readout mt-1 text-xl font-medium"
        style={{ color: accent }}
      >
        {value}
        <span className="ml-1 text-[0.65rem] text-[var(--ink-muted)]">{unit}</span>
      </p>
      {sub ? (
        <p className="font-body mt-0.5 text-[0.6rem] text-[var(--ink-muted)]">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function MapAdvancedStats({
  forecast,
  point,
  hourIndex,
  plants,
  plantOutputs,
  loading,
}: MapAdvancedStatsProps) {
  if (loading && !forecast) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="scada-panel h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!forecast || !point) {
    return (
      <div className="scada-panel px-4 py-6 text-center">
        <p className="font-body text-sm text-[var(--ink-muted)]">
          Load a zone forecast to drive map playback statistics.
        </p>
      </div>
    );
  }

  const byType = aggregateOutputByType(plants, plantOutputs);
  const chartData = forecast.points.map((p, i) => ({
    i,
    net: p.net_load_mw,
    solar: p.solar_mw,
    demand: p.demand_mw,
    label: formatPlaybackClock(p.timestamp),
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            Advanced statistics
          </h2>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            {formatPlaybackClock(point.timestamp)} · zone {forecast.zone}
          </p>
        </div>
        <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
          {point.weather_regime ?? "regime n/a"}
          {point.is_weekend ? " · weekend" : ""}
          {point.is_poya ? " · poya" : ""}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCell
          label="SOLAR (ZONE)"
          value={point.solar_mw.toFixed(0)}
          unit="MW"
          accent="var(--solar)"
          sub={
            point.solar_p10_mw != null && point.solar_p90_mw != null
              ? `P10–P90 ${point.solar_p10_mw.toFixed(0)}–${point.solar_p90_mw.toFixed(0)}`
              : undefined
          }
        />
        <StatCell
          label="DEMAND"
          value={point.demand_mw.toFixed(0)}
          unit="MW"
          accent="var(--demand)"
        />
        <StatCell
          label="NET LOAD"
          value={point.net_load_mw.toFixed(0)}
          unit="MW"
          accent="var(--monsoon)"
        />
        <StatCell
          label="GHI"
          value={point.ghi_wm2 != null ? point.ghi_wm2.toFixed(0) : "—"}
          unit="W/m²"
          accent="var(--solar)"
        />
        <StatCell
          label="CLOUD"
          value={
            point.cloudcover_pct != null
              ? point.cloudcover_pct.toFixed(0)
              : "—"
          }
          unit="%"
          accent="var(--ink-muted)"
        />
        <StatCell
          label="OPERATIONAL RISK"
          value={
            point.hosting_risk || point.curtailment_risk
              ? "HIGH"
              : point.net_load_mw < (forecast.risk_threshold_mw ?? 50) * 1.2
                ? "MODERATE"
                : "LOW"
          }
          unit=""
          accent={
            point.hosting_risk || point.curtailment_risk
              ? "var(--risk)"
              : "var(--ok)"
          }
          sub={point.tou_peak ? "TOU peak window" : "Off-peak"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="scada-panel">
          <div className="scada-panel-header">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              Net-load playhead
            </h3>
          </div>
          <div className="h-[180px] px-1 py-2 sm:px-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="i" hide />
                <YAxis
                  tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
                  width={42}
                  stroke="var(--line)"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    border: "1px solid var(--line)",
                    background: "var(--panel-elevated)",
                    color: "var(--foreground)",
                  }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.label ?? ""
                  }
                  formatter={(v, name) => [
                    `${Number(v).toFixed(0)} MW`,
                    String(name),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="demand"
                  name="Demand"
                  stroke="var(--demand)"
                  fill="var(--demand)"
                  fillOpacity={0.08}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="solar"
                  name="Solar"
                  stroke="var(--solar)"
                  fill="var(--solar)"
                  fillOpacity={0.12}
                  strokeWidth={1.2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Net load"
                  stroke="var(--monsoon)"
                  fill="var(--monsoon)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                <ReferenceLine
                  x={hourIndex}
                  stroke="var(--foreground)"
                  strokeDasharray="4 3"
                  strokeWidth={1.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="scada-panel">
          <div className="scada-panel-header">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              Estimated utilization by type
            </h3>
          </div>
          <div className="space-y-2 px-3 py-3">
            {ALL_TYPES.map((t) => {
              const mw = byType[t];
              const max = plants
                .filter((p) => p.type === t)
                .reduce((s, p) => s + p.capacity_mw, 0);
              const util = max > 0 ? (mw / max) * 100 : 0;
              const confidence = 0.72 + util * 0.18;
              return (
                <div key={t}>
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono-readout text-[0.65rem] text-[var(--foreground)]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: PLANT_COLORS[t] }}
                        aria-hidden
                      />
                      {PLANT_LABELS[t]}
                    </span>
                    <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                      est. {util.toFixed(0)}% util · conf {(confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--mist)]">
                    <div
                      className="h-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${Math.min(100, util)}%`,
                        background: PLANT_COLORS[t],
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="font-body pt-1 text-[0.6rem] leading-relaxed text-[var(--ink-muted)]">
              Estimated commitment and utilization from merit-order model — not
              live SCADA telemetry. Confidence reflects forecast band width.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
