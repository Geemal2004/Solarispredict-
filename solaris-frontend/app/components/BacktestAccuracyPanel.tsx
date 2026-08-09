"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestMetrics } from "@/lib/api";

interface BacktestAccuracyPanelProps {
  metrics: BacktestMetrics | null;
}

export function BacktestAccuracyPanel({ metrics }: BacktestAccuracyPanelProps) {
  if (!metrics) return null;
  const series = metrics.rolling_mae ?? [];

  return (
    <section className="scada-panel px-4 py-4">
      <h3 className="font-display text-sm font-semibold text-[var(--foreground)]">
        Rolling backtest MAE · {metrics.zone}
      </h3>
      <p className="font-body mt-1 text-xs text-[var(--ink-muted)]">
        Holdout RMSE {metrics.rmse} · MAE {metrics.mae} {metrics.unit}. Daily MAE
        on the last {series.length || 14} days of NASA POWER ground truth.
      </p>
      {series.length === 0 ? (
        <p className="font-body mt-4 text-sm text-[var(--ink-muted)]">
          Re-train models to populate the rolling series.
        </p>
      ) : (
        <div className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
                width={36}
                label={{
                  value: "MAE",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--ink-muted)",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                }}
              />
              <Line
                type="monotone"
                dataKey="mae"
                name="Daily MAE"
                stroke="var(--demand)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
