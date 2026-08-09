"use client";

import type { CebBaseline } from "@/lib/api";

interface StateOfGridStripProps {
  baseline: CebBaseline | null;
}

export function StateOfGridStrip({ baseline }: StateOfGridStripProps) {
  if (!baseline) {
    return (
      <div className="scada-panel px-3 py-3">
        <p className="font-body text-xs text-[var(--warn)]">
          CEB Digest baseline unavailable — ensure backend serves /stats/ceb-baseline
          and restart uvicorn.
        </p>
      </div>
    );
  }

  const cells = [
    {
      label: "INSTALLED",
      value: `${baseline.installed_capacity_mw.toLocaleString()}`,
      unit: "MW",
    },
    {
      label: "RE SHARE",
      value: `${baseline.renewable_share_pct}`,
      unit: "%",
    },
    {
      label: "ROOFTOP PV",
      value: `${baseline.rooftop_solar_mw.toLocaleString()}`,
      unit: "MW",
      sub: `${baseline.rooftop_connections.toLocaleString()} conn · ${baseline.rooftop_energy_share_pct}% E`,
    },
    {
      label: "NIGHT / DAY Pmax",
      value: `${baseline.night_max_demand_mw.toLocaleString()} / ${baseline.day_max_demand_mw.toLocaleString()}`,
      unit: "MW",
    },
    {
      label: "TOU PEAK",
      value: baseline.tou_peak_window,
      unit: "",
    },
  ];

  return (
    <section aria-label="State of the grid 2025" className="scada-panel">
      <div className="scada-panel-header">
        <div className="flex items-center gap-2">
          <span className="status-led status-led-ok" />
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            State of the Grid {baseline.year_label}
          </h2>
        </div>
        <p className="font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
          CEB DIGEST · NOT SCADA
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--line)] sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="bg-[var(--panel)] px-2.5 py-2.5">
            <p className="font-mono-readout text-[0.6rem] tracking-wide text-[var(--ink-muted)]">
              {c.label}
            </p>
            <p className="font-mono-readout mt-1 text-sm font-medium text-[var(--solar)] sm:text-base">
              {c.value}
              {c.unit ? (
                <span className="ml-1 text-[0.65rem] text-[var(--ink-muted)]">
                  {c.unit}
                </span>
              ) : null}
            </p>
            {c.sub ? (
              <p className="font-body mt-0.5 text-[0.6rem] text-[var(--ink-muted)]">
                {c.sub}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {baseline.annual_report_2023?.day_peak_example ? (
        <p className="border-t border-[var(--line)] px-3 py-1.5 font-body text-[0.65rem] text-[var(--ink-muted)]">
          AR2023: day peak {baseline.annual_report_2023.day_peak_example.mw} MW @
          16:00 (rooftop shift). {baseline.annual_report_2023.ncre_visibility}
        </p>
      ) : null}
    </section>
  );
}
