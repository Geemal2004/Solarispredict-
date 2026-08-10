"use client";

import { useState } from "react";
import {
  fetchNationalScenario,
  type NationalForecast,
} from "@/lib/api";

const PRESETS = [
  { id: "base", label: "Baseline", params: {} },
  {
    id: "cloud",
    label: "Cloud +20%",
    params: { cloud_delta_pct: 20 },
  },
  {
    id: "rooftop",
    label: "Rooftop +500 MW",
    params: { rooftop_solar_mw: 500 },
  },
  {
    id: "outage",
    label: "Thermal −300 MW",
    params: { thermal_outage_mw: 300 },
  },
  {
    id: "wind",
    label: "Wind collapse",
    params: { wind_collapse: true },
  },
  {
    id: "hydro",
    label: "Hydro conserve",
    params: { hydro_conserve: true },
  },
] as const;

export function ScenarioSimulator({
  onResult,
}: {
  onResult: (forecast: NationalForecast) => void;
}) {
  const [active, setActive] = useState<string>("base");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, params: Record<string, unknown>) {
    setActive(id);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNationalScenario({
        hours: 48,
        ...params,
      });
      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <p className="font-mono-readout text-[0.65rem] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Scenario simulator
        </p>
        <h3 className="font-display text-base font-semibold">
          What-if overlays on the national forecast
        </h3>
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={loading}
            onClick={() => void run(p.id, p.params as Record<string, unknown>)}
            className={[
              "border px-2.5 py-1.5 font-mono-readout text-[0.65rem] uppercase tracking-wide",
              active === p.id
                ? "border-[var(--solar)] bg-[var(--mist)] text-[var(--solar)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="border-t border-[var(--line)] px-3 py-2 font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
          Running scenario…
        </p>
      ) : null}
      {error ? (
        <p className="border-t border-[var(--line)] px-3 py-2 font-mono-readout text-[0.65rem] text-[var(--risk)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
