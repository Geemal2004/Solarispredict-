"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { NationalStats } from "@/lib/api";

const MIX_COLORS: Record<string, string> = {
  hydro: "#6eb6ff",
  coal: "#6b7280",
  oil: "#ff6b6b",
  wind: "#3ecf8e",
  solar: "#e8a33d",
};

interface LiveStatCardsProps {
  stats: NationalStats | null;
  loading?: boolean;
}

export function LiveStatCards({ stats, loading }: LiveStatCardsProps) {
  if (loading && !stats) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="scada-panel h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const mixData = Object.entries(stats.generation_mix_reference.shares).map(
    ([name, value]) => ({
      name,
      value: Number(value),
      fill: MIX_COLORS[name] ?? "#8a96a8",
    })
  );

  const cards = [
    {
      label: "SOLAR NOW",
      value: stats.solar_mw_now.toFixed(0),
      unit: "MW",
      accent: "var(--solar)",
    },
    {
      label: "DEMAND (SCALED)",
      value: stats.demand_mw_now.toFixed(0),
      unit: "MW",
      accent: "var(--demand)",
      sub: stats.national_digest_reference
        ? `Digest Pmax ${stats.national_digest_reference.night_max_demand_mw.toLocaleString()}`
        : undefined,
    },
    {
      label: "NET LOAD",
      value: stats.net_load_mw_now.toFixed(0),
      unit: "MW",
      accent: "var(--monsoon)",
    },
    {
      label: "NET-LOAD RISK E",
      value:
        stats.avoidable_curtailment.mwh_next_hour > 0
          ? stats.avoidable_curtailment.mwh_next_hour.toFixed(0)
          : "0",
      unit: "MWh",
      accent: "var(--risk)",
      sub: "Illustrative · not CEB GWh",
    },
  ];

  return (
    <div className="grid gap-2 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="scada-panel px-2.5 py-2">
          <p className="font-mono-readout text-[0.6rem] tracking-wide text-[var(--ink-muted)]">
            {c.label}
          </p>
          <p
            className="font-mono-readout mt-1 text-xl font-medium"
            style={{ color: c.accent }}
          >
            {c.value}
            <span className="ml-1 text-[0.65rem] text-[var(--ink-muted)]">
              {c.unit}
            </span>
          </p>
          {c.sub ? (
            <p className="font-body mt-0.5 text-[0.6rem] text-[var(--ink-muted)]">
              {c.sub}
            </p>
          ) : (
            <p className="font-mono-readout mt-0.5 text-[0.6rem] text-[var(--ink-muted)]">
              EST
            </p>
          )}
        </div>
      ))}

      <div className="scada-panel px-2 py-1.5">
        <p className="font-mono-readout px-1 text-[0.6rem] tracking-wide text-[var(--ink-muted)]">
          MIX REF
        </p>
        <div className="h-[72px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mixData}
                dataKey="value"
                nameKey="name"
                innerRadius={22}
                outerRadius={34}
                paddingAngle={1}
              >
                {mixData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}
                contentStyle={{
                  fontSize: 11,
                  border: "1px solid var(--line)",
                  background: "var(--panel-elevated)",
                  color: "var(--foreground)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="font-mono-readout px-1 text-[0.6rem] text-[var(--ink-muted)]">
          SOLAR {(stats.generation_mix_live_solar_share * 100).toFixed(1)}% LIVE
        </p>
      </div>
    </div>
  );
}
