"use client";

import { useId, useState } from "react";

export function EvidenceDrawer() {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <section className="scada-panel">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="font-display flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold tracking-wide text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar)]"
      >
        How this maps to the papers
        <span aria-hidden className="text-xs">
          {open ? "−" : "+"}
        </span>
      </button>
      <div id={id} hidden={!open} className="space-y-3 border-t border-[var(--line)] px-4 py-4">
        <article className="border-l-2 border-[var(--solar)] pl-3">
          <h3 className="font-display text-xs font-semibold text-[var(--foreground)]">
            Amarasinghe &amp; Abeygunawardane · EECon 2018
          </h3>
          <p className="font-body mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            Weather-driven tree ensembles beat Smart Persistence at Buruthakanda
            (Hambantota). We use XGBoost on NASA POWER + Open-Meteo with the same
            regime story (clear / partly cloudy / overcast).
          </p>
        </article>
        <article className="border-l-2 border-[var(--demand)] pl-3">
          <h3 className="font-display text-xs font-semibold text-[var(--foreground)]">
            Abeysingha et al. · ICIAFS 2021
          </h3>
          <p className="font-body mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            CEB System Control hourly load: calendar (Poya, New Year, Vesak,
            weekend) dominates weather in the tropics. Our demand curve is
            pattern-based from those findings — not live SCC telemetry.
          </p>
        </article>
        <article className="border-l-2 border-[var(--monsoon)] pl-3">
          <h3 className="font-display text-xs font-semibold text-[var(--foreground)]">
            Premathilaka et al. · iPURSE 2025 + CEB Digest 2025
          </h3>
          <p className="font-body mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            Reservoir FPV potential (Feb–Apr peak) and Digest rooftop scale
            (~1.9 GW) frame why net-load foresight matters for evening TOU peak
            18:30–22:30.
          </p>
        </article>
      </div>
    </section>
  );
}
