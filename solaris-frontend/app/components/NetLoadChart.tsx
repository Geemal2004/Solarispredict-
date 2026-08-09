"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetLoadForecast } from "@/lib/api";

interface NetLoadChartProps {
  forecast: NetLoadForecast | null;
}

function formatTick(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-LK", {
    timeZone: "Asia/Colombo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTooltipLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-LK", {
    timeZone: "Asia/Colombo",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function NetLoadChart({ forecast }: NetLoadChartProps) {
  const data = useMemo(() => {
    if (!forecast) return [];
    return forecast.points.map((p) => {
      const p10 = p.solar_p10_mw;
      const p90 = p.solar_p90_mw;
      const hasBand = p10 != null && p90 != null;
      return {
        ...p,
        threshold: forecast.curtailment_threshold_mw,
        solar_p10_base: hasBand ? p10 : undefined,
        solar_band: hasBand ? Math.max(0, p90! - p10!) : undefined,
      };
    });
  }, [forecast]);

  const riskBands = useMemo(() => {
    if (!forecast) return [] as { x1: string; x2: string }[];
    const bands: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    let prev: string | null = null;

    for (const p of forecast.points) {
      if (p.curtailment_risk || p.hosting_risk) {
        if (!start) start = p.timestamp;
        prev = p.timestamp;
      } else if (start && prev) {
        bands.push({ x1: start, x2: prev });
        start = null;
        prev = null;
      }
    }
    if (start && prev) bands.push({ x1: start, x2: prev });
    return bands;
  }, [forecast]);

  const touBands = useMemo(() => {
    if (!forecast) return [] as { x1: string; x2: string }[];
    const bands: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    let prev: string | null = null;
    for (const p of forecast.points) {
      if (p.tou_peak) {
        if (!start) start = p.timestamp;
        prev = p.timestamp;
      } else if (start && prev) {
        bands.push({ x1: start, x2: prev });
        start = null;
        prev = null;
      }
    }
    if (start && prev) bands.push({ x1: start, x2: prev });
    return bands;
  }, [forecast]);

  const yMax = useMemo(() => {
    if (!data.length) return 100;
    const peak = Math.max(
      ...data.map((d) =>
        Math.max(
          d.demand_mw,
          d.solar_mw,
          d.net_load_mw,
          d.solar_p90_mw ?? 0,
          0
        )
      )
    );
    return Math.ceil(peak * 1.12);
  }, [data]);

  const hasQuantiles = data.some((d) => d.solar_band != null);

  if (!forecast || data.length === 0) {
    return (
      <div className="flex min-h-[280px] w-full items-center justify-center scada-panel sm:h-[min(58vh,420px)]">
        <p className="font-body text-sm text-[var(--ink-muted)]">
          Select a zone to load the net-load forecast.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[min(52vh,380px)] w-full min-h-[260px] sm:h-[min(58vh,480px)] sm:min-h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 4, left: -8, bottom: 4 }}
        >
          <defs>
            <linearGradient id="fillSolar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--solar)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--solar)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillDemand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--demand)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--demand)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--monsoon)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--monsoon)" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="var(--line)"
            strokeDasharray="3 6"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTick}
            minTickGap={28}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
            label={{
              value: "MW",
              angle: -90,
              position: "insideLeft",
              fill: "var(--ink-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip
            labelFormatter={(label) => formatTooltipLabel(String(label))}
            contentStyle={{
              background: "var(--panel-elevated)",
              border: "1px solid var(--line)",
              borderRadius: 0,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)} MW`,
              String(name),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="plainline"
          />

          {riskBands.map((b) => (
            <ReferenceArea
              key={`risk-${b.x1}-${b.x2}`}
              x1={b.x1}
              x2={b.x2}
              y1={0}
              y2={
                forecast.risk_threshold_mw ?? forecast.curtailment_threshold_mw
              }
              fill="var(--risk)"
              fillOpacity={0.18}
              strokeOpacity={0}
            />
          ))}

          {touBands.map((b) => (
            <ReferenceArea
              key={`tou-${b.x1}-${b.x2}`}
              x1={b.x1}
              x2={b.x2}
              fill="var(--demand)"
              fillOpacity={0.07}
              strokeOpacity={0}
            />
          ))}

          {hasQuantiles ? (
            <>
              <Area
                type="monotone"
                dataKey="solar_p10_base"
                stackId="qband"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="solar_band"
                name="Solar 10–90% band"
                stackId="qband"
                stroke="none"
                fill="var(--solar)"
                fillOpacity={0.22}
                isAnimationActive
                animationDuration={600}
              />
            </>
          ) : null}

          <Area
            type="monotone"
            dataKey="demand_mw"
            name="Demand"
            stroke="var(--demand)"
            fill="url(#fillDemand)"
            strokeWidth={2}
            isAnimationActive
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="solar_mw"
            name="Solar"
            stroke="var(--solar)"
            fill="url(#fillSolar)"
            strokeWidth={2}
            isAnimationActive
            animationDuration={850}
          />
          <Area
            type="monotone"
            dataKey="net_load_mw"
            name="Net load"
            stroke="var(--monsoon)"
            fill="url(#fillNet)"
            strokeWidth={2.5}
            isAnimationActive
            animationDuration={1000}
          />

          <Brush
            key={`${forecast.zone}-${forecast.hours}-${data.length}`}
            dataKey="timestamp"
            height={28}
            stroke="var(--line)"
            fill="var(--mist)"
            travellerWidth={8}
            tickFormatter={formatTick}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
