"use client";

import { useId, useState } from "react";

interface MethodologyPanelProps {
  defaultOpen?: boolean;
  alwaysOpen?: boolean;
}

export function MethodologyPanel({
  defaultOpen = false,
  alwaysOpen = false,
}: MethodologyPanelProps) {
  const [open, setOpen] = useState(defaultOpen || alwaysOpen);
  const panelId = useId();
  const shown = alwaysOpen || open;

  return (
    <section className={alwaysOpen ? "" : "border-t border-[var(--line)] pt-6"}>
      {!alwaysOpen ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="font-display group flex w-full items-center justify-between gap-4 text-left text-sm font-semibold tracking-wide text-[var(--demand)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mist)]"
        >
          <span>Methodology &amp; citations</span>
          <span
            aria-hidden
            className={[
              "inline-flex h-7 w-7 items-center justify-center border border-[var(--line)] bg-[var(--panel)] text-xs transition-transform duration-200",
              open ? "rotate-45" : "",
            ].join(" ")}
          >
            +
          </span>
        </button>
      ) : (
        <h2 className="font-display text-sm font-semibold tracking-wide text-[var(--demand)]">
          Methodology &amp; citation appendix
        </h2>
      )}

      <div
        id={panelId}
        hidden={!shown}
        className="animate-fade-in mt-4 max-w-3xl space-y-5 font-body text-sm leading-relaxed text-[var(--ink-muted)]"
      >
        <p className="text-[var(--foreground)]">
          <strong>Product claim:</strong> a Sri Lanka Grid Digital Twin —
          official NSO / EDLCare gensum operational archive at 15-minute
          resolution, weather-driven national demand / solar / net-load models,
          historical replay, and merit-order dispatch intelligence.
        </p>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--solar)]">
            NSO operational archive
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              Public JSON from{" "}
              <code className="text-[var(--foreground)]">edlcare.edl.lk/api/gensum/*</code>{" "}
              (load-curve, solar-forecast, peaks, reservoirs) — no login required
              for gensum endpoints.
            </li>
            <li>
              181 days · 17,195 generation intervals (2026-02-10 → 2026-08-09)
              fused with Open-Meteo archive weather into{" "}
              <code className="text-[var(--foreground)]">training_15min.parquet</code>.
            </li>
            <li>
              National XGBoost holdout: demand MAE ~47 MW (vs ~187 MW persistence),
              solar MAE ~24 MW, net-load MAE ~57 MW. Distributed solar visibility
              index ~12%.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--solar)]">
            Academic sources
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              Amarasinghe, P.A.G.M. &amp; Abeygunawardane, S.K. —{" "}
              <em>
                Application of Machine Learning Algorithms for Solar Power
                Forecasting in Sri Lanka
              </em>
              , EECon 2018 (Buruthakanda). RF beat Smart Persistence; partly
              cloudy hardest.
            </li>
            <li>
              Abeysingha et al. —{" "}
              <em>
                Electricity Load/demand Forecasting in Sri Lanka using Deep
                Learning Techniques
              </em>
              , ICIAFS 2021. Calendar (Poya, New Year, Vesak, weekend) dominates
              tropical weather for CEB System Control load.
            </li>
            <li>
              Premathilaka, Yapa &amp; Punchi-Manage —{" "}
              <em>Uncovering the Solar Energy Potential of Reservoirs…</em>,
              iPURSE 2025. FPV on reservoirs; Feb–Apr peak; named sites on map.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--demand)]">
            Official grid statistics
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              CEB Statistical Digest 2025 — installed ~4,814 MW; RE ~60.2%;
              rooftop ~1,935 MW / 108,979 systems / ~9.4% of energy; night/day
              peaks; TOU peak 18:30–22:30.
            </li>
            <li>
              CEB Annual Report 2023 — day peak delayed by rooftop (e.g. 16:00 on
              22 Aug 2023); NCRE visibility / CEB Assist context for day-ahead
              dispatch.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--demand)]">
            What is estimated vs official
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[var(--demand)]">National demand / solar / net load</strong>{" "}
              — XGBoost trained on NSO 15-min actuals + Open-Meteo; zone GHI models
              remain available for plant-level views.
            </li>
            <li>
              <strong className="text-[var(--demand)]">Demand (zone mode)</strong> —
              legacy calendar load curve still available per zone; national
              briefing uses NSO-trained demand.
            </li>
            <li>
              <strong className="text-[var(--demand)]">Dispatch</strong> —
              merit-order heuristics (oil first off, coal min-stable, hydro for
              TOU, RE must-run) — not CEB EMS.
            </li>
            <li>
              <strong className="text-[var(--demand)]">Hosting risk</strong> —
              net load &lt; 15% of zone peak demand; not a published curtailment
              GWh series.
            </li>
            <li>
              <strong className="text-[var(--demand)]">Map</strong> — town-level
              plant coords; synthetic rooftop sample summing to Digest rooftop
              MW; FPV markers = potential.
            </li>
          </ul>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>NASA POWER — historical satellite meteorology</li>
          <li>Open-Meteo — live radiation / cloud / temperature</li>
          <li>geoBoundaries LKA ADM1 — province boundaries (ODbL)</li>
        </ul>
      </div>
    </section>
  );
}
