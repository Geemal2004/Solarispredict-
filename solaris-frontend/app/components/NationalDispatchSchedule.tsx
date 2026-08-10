"use client";

import type { NationalDispatchScheduleResponse } from "@/lib/api";

export function NationalDispatchSchedule({
  schedule,
  loading,
}: {
  schedule: NationalDispatchScheduleResponse | null;
  loading?: boolean;
}) {
  const rows = schedule?.schedule ?? [];
  const netLow = schedule?.context?.min_net_load_mw;
  const ramp = schedule?.context?.evening_ramp_mw;
  const confidence = schedule?.confidence_pct ?? 85;

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
        <p className="px-4 py-6 font-body text-sm text-[var(--ink-muted)]">
          Computing schedule…
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 font-body text-sm text-[var(--ink-muted)]">
          Load national forecast to generate dispatch schedule.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <li
                key={row.plant}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="font-display font-semibold text-[var(--foreground)]">
                    {row.plant}
                  </p>
                  <p className="font-mono-readout text-[0.72rem] text-[var(--solar)]">
                    {row.action}
                  </p>
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
            {schedule?.methodology ??
              "Estimated commitments with plant, MW, and time — not live SCADA dispatch orders."}
          </p>
        </>
      )}
    </section>
  );
}
