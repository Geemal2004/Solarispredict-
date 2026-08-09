"use client";

import type { CalendarHorizon, NetLoadForecast, SolarEvidence } from "@/lib/api";

interface ResearchEvidenceProps {
  evidence: SolarEvidence | null;
  calendar: CalendarHorizon | null;
  forecast?: NetLoadForecast | null;
  weatherRegime?: string | null;
  eveningRampMw?: number | null;
  evidenceLoading?: boolean;
}

const REGIME_LABEL: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly cloudy",
  overcast: "Overcast",
  unknown: "Unknown",
};

function chipsFromForecast(forecast?: NetLoadForecast | null) {
  if (!forecast?.points?.length) return null;
  const active = {
    weekend: forecast.points.some((p) => p.is_weekend),
    poya: forecast.points.some((p) => p.is_poya),
    new_year: forecast.points.some((p) => p.is_new_year),
    vesak: forecast.points.some((p) => p.is_vesak),
  };
  return active;
}

export function ResearchEvidence({
  evidence,
  calendar,
  forecast,
  weatherRegime,
  eveningRampMw,
  evidenceLoading,
}: ResearchEvidenceProps) {
  const lit = evidence?.literature;
  const build = evidence?.this_build;
  const active = calendar?.active ?? chipsFromForecast(forecast);

  return (
    <div className="grid gap-2 lg:grid-cols-3">
      <div className="scada-panel">
        <div className="scada-panel-header">
          <span className="font-display text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Weather regime
          </span>
          <span
            className={[
              "status-led",
              weatherRegime === "clear"
                ? "status-led-ok"
                : weatherRegime === "partly_cloudy"
                  ? "status-led-warn"
                  : weatherRegime === "overcast"
                    ? "status-led-alarm"
                    : "status-led-idle",
            ].join(" ")}
          />
        </div>
        <div className="px-3 py-2.5">
          <p className="font-display text-base font-semibold text-[var(--foreground)]">
            {REGIME_LABEL[weatherRegime ?? "unknown"] ?? weatherRegime ?? "—"}
          </p>
          <p className="font-body mt-1 text-[0.68rem] leading-snug text-[var(--ink-muted)]">
            2018 Buruthakanda case studies — partly cloudy hardest. Hambantota =
            paper plant site.
          </p>
        </div>
      </div>

      <div className="scada-panel">
        <div className="scada-panel-header">
          <span className="font-display text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Model vs Smart Persistence
          </span>
        </div>
        <div className="px-3 py-2.5">
          {lit ? (
            <>
              <p className="font-mono-readout text-sm font-medium text-[var(--solar)]">
                RF {lit.normalized_rmse.random_forest} · SP{" "}
                {lit.normalized_rmse.smart_persistence} nRMSE
              </p>
              <p className="font-body mt-1 text-[0.68rem] leading-snug text-[var(--ink-muted)]">
                Literature (EECon 2018). This build holdout RMSE{" "}
                <span className="font-mono-readout text-[var(--foreground)]">
                  {build?.rmse ?? "—"}
                </span>{" "}
                / MAE{" "}
                <span className="font-mono-readout text-[var(--foreground)]">
                  {build?.mae ?? "—"}
                </span>{" "}
                {build?.unit ?? ""}
              </p>
            </>
          ) : evidenceLoading ? (
            <p className="font-body text-sm text-[var(--ink-muted)]">Fetching evidence…</p>
          ) : (
            <p className="font-body text-sm text-[var(--warn)]">
              Evidence endpoint unavailable — restart backend if needed.
            </p>
          )}
        </div>
      </div>

      <div className="scada-panel">
        <div className="scada-panel-header">
          <span className="font-display text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Calendar intelligence
          </span>
        </div>
        <div className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {active ? (
              <>
                {active.weekend ? (
                  <span className="border border-[var(--line)] bg-[var(--mist)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--demand)]">
                    WEEKEND
                  </span>
                ) : null}
                {active.poya ? (
                  <span className="border border-[var(--line)] bg-[var(--mist)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--demand)]">
                    POYA
                  </span>
                ) : null}
                {active.new_year ? (
                  <span className="border border-[var(--solar)]/50 bg-[var(--solar-wash)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--solar)]">
                    NEW YEAR
                  </span>
                ) : null}
                {active.vesak ? (
                  <span className="border border-[var(--line)] bg-[var(--mist)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--demand)]">
                    VESAK
                  </span>
                ) : null}
                {!active.weekend &&
                !active.poya &&
                !active.new_year &&
                !active.vesak ? (
                  <span className="border border-[var(--line)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                    WEEKDAY
                  </span>
                ) : null}
              </>
            ) : evidenceLoading ? (
              <span className="text-[0.7rem] text-[var(--ink-muted)]">Fetching…</span>
            ) : (
              <span className="text-[0.7rem] text-[var(--warn)]">No calendar flags</span>
            )}
          </div>
          <p className="font-body mt-2 text-[0.68rem] leading-snug text-[var(--ink-muted)]">
            Abeysingha et al. 2021 — calendar &gt; weather for SL demand.
            {eveningRampMw != null
              ? ` Evening ramp ≈ ${eveningRampMw} MW.`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
