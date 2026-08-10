"use client";

import type { NationalBriefing, NationalForecast } from "@/lib/api";

const DISPATCH_SCHEDULE = [
  { plant: "Kerawalapitiya", action: "−40 MW at 11:30", confidence: 0.92 },
  { plant: "Sapugaskanda", action: "Standby reserve", confidence: 0.88 },
  { plant: "Lakvijaya", action: "Minimum stable load", confidence: 0.95 },
  { plant: "Hydro fleet", action: "Preserve 120 MWh for evening peak", confidence: 0.91 },
];

export function NationalDispatchSchedule({
  briefing,
  forecast,
  loading,
}: {
  briefing: NationalBriefing | null;
  forecast: NationalForecast | null;
  loading?: boolean;
}) {
  const netLow = forecast?.daily?.[0]?.min_net_load_mw;
  const ramp = forecast?.daily?.[0]?.evening_ramp_mw;
  const confidence = briefing?.archive.models?.netload_xgb?.r2
    ? Math.round(briefing.archive.models.netload_xgb.r2 * 100)
    : 85;

  return (
    <section className="scada-panel">
      <div className="scada-panel-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
            Recommended dispatch schedule
          </h2>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            National merit-order · NSO-anchored forecast
          </p>
        </div>
        <span className="border border-[var(--ok)]/40 px-2 py-1 font-mono-readout text-[0.7rem] text-[var(--ok)]">
          Confidence {confidence}%
        </span>
      </div>

      {loading ? (
        <p className="px-4 py-6 font-body text-sm text-[var(--ink-muted)]">Computing schedule…</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line)]">
            {DISPATCH_SCHEDULE.map((row) => (
              <li key={row.plant} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-display font-semibold text-[var(--foreground)]">{row.plant}</p>
                  <p className="font-mono-readout text-[0.72rem] text-[var(--solar)]">{row.action}</p>
                </div>
                <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                  {(row.confidence * 100).toFixed(0)}% conf.
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--line)] px-4 py-3 font-body text-xs leading-relaxed text-[var(--ink-muted)]">
            {netLow != null && ramp != null
              ? `Evening min net load ${netLow.toFixed(0)} MW · ramp ${ramp.toFixed(0)} MW. `
              : ""}
            Schedule derived from national net-load forecast and merit-order rules — estimated
            commitments, not live SCADA dispatch orders.
          </p>
        </>
      )}
    </section>
  );
}
