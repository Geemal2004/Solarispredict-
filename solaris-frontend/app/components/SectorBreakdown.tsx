"use client";

import type { NationalStats } from "@/lib/api";

interface SectorBreakdownProps {
  stats: NationalStats | null;
}

const LABELS: Record<string, string> = {
  domestic: "Domestic",
  industrial: "Industrial",
  commercial: "Commercial (GP)",
  other: "Other (LECO, hotel, gov, …)",
};

export function SectorBreakdown({ stats }: SectorBreakdownProps) {
  if (!stats) return null;

  const entries = Object.entries(stats.sector_demand_mw);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <section className="scada-panel px-4 py-4">
      <h3 className="font-display text-sm font-semibold tracking-wide text-[var(--foreground)]">
        Sector demand split
      </h3>
      <p className="font-body mt-1 text-xs text-[var(--ink-muted)]">
        {stats.sector_source}
      </p>
      <ul className="mt-4 space-y-3">
        {entries.map(([key, mw]) => {
          const share = stats.sector_shares[key] ?? 0;
          return (
            <li key={key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-display font-medium text-[var(--foreground)]">
                  {LABELS[key] ?? key}
                </span>
                <span className="font-body text-[var(--ink-muted)]">
                  {mw.toFixed(0)} MW · {(share * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-[var(--mist)]">
                <div
                  className="h-2 bg-[var(--demand)]"
                  style={{ width: `${(mw / max) * 100}%`, opacity: 0.55 + share }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="font-body mt-3 text-[0.65rem] text-[var(--ink-muted)]">
        Estimated — shares from CEB Digest applied to modeled national demand
      </p>
    </section>
  );
}
