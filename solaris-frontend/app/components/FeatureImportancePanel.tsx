"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestMetrics } from "@/lib/api";

interface FeatureImportancePanelProps {
  metrics: BacktestMetrics | null;
}

export function FeatureImportancePanel({
  metrics,
}: FeatureImportancePanelProps) {
  if (!metrics?.feature_importance?.length) {
    return (
      <section className="scada-panel px-4 py-4">
        <h3 className="font-display text-sm font-semibold text-[var(--foreground)]">
          Feature importance
        </h3>
        <p className="font-body mt-2 text-sm text-[var(--ink-muted)]">
          Re-train models to publish top-5 importances for this zone.
        </p>
      </section>
    );
  }

  const data = [...metrics.feature_importance].reverse();

  return (
    <section className="scada-panel px-4 py-4">
      <h3 className="font-display text-sm font-semibold text-[var(--foreground)]">
        Top features · {metrics.zone}
      </h3>
      <p className="font-body mt-1 text-xs text-[var(--ink-muted)]">
        XGBoost gain-based importance (point-forecast model)
      </p>
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--ink-muted)" }} />
            <YAxis
              type="category"
              dataKey="feature"
              width={88}
              tick={{ fontSize: 10, fill: "var(--ink-muted)" }}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                background: "var(--panel)",
                border: "1px solid var(--line)",
              }}
            />
            <Bar dataKey="importance" name="Importance" fill="var(--solar)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
