"use client";

import type { NetLoadForecast } from "@/lib/api";

interface OperationalRiskBannerProps {
  forecast: NetLoadForecast | null;
}

function firstRiskTime(forecast: NetLoadForecast): string | null {
  const hit = forecast.points.find(
    (p) => p.hosting_risk || p.curtailment_risk
  );
  if (!hit) return null;
  return new Date(hit.timestamp).toLocaleString("en-LK", {
    timeZone: "Asia/Colombo",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function OperationalRiskBanner({ forecast }: OperationalRiskBannerProps) {
  if (!forecast) return null;

  const anyRisk = forecast.any_hosting_risk ?? forecast.any_curtailment_risk;
  const when = anyRisk ? firstRiskTime(forecast) : null;
  const threshold =
    forecast.risk_threshold_mw ?? forecast.curtailment_threshold_mw;
  const ramp = forecast.evening_ramp_mw;

  if (!anyRisk && (ramp == null || ramp === 0)) return null;

  const riskLevel = anyRisk ? "High operational risk" : "Moderate operational risk";

  return (
    <aside
      role="status"
      aria-live="polite"
      className="scada-panel border-l-[3px] border-l-[var(--risk)]"
    >
      <div className="scada-panel-header">
        <div className="flex items-center gap-2">
          <span
            className={[
              "status-led",
              anyRisk ? "status-led-alarm animate-blink-alarm" : "status-led-warn",
            ].join(" ")}
          />
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--risk)]">
            {riskLevel}
          </p>
        </div>
        {threshold != null ? (
          <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            THR {threshold.toFixed(0)} MW · 15% peak
          </span>
        ) : null}
      </div>
      <p className="px-3 py-2.5 font-body text-sm leading-relaxed text-[var(--foreground)] sm:px-4">
        {anyRisk
          ? when
            ? `Net load below operational threshold around ${when}. `
            : `Net load dips below operational-risk threshold. `
          : ""}
        {ramp != null
          ? `Midday→evening ramp ≈ ${ramp} MW into TOU 18:30–22:30. `
          : ""}
        Net-load operational risk signal — not distribution hosting capacity.
        Prefer oil ramp-down 60–90 min ahead; conserve hydro for evening peak.
      </p>
    </aside>
  );
}

/** @deprecated use OperationalRiskBanner */
export const HostingRiskBanner = OperationalRiskBanner;
export const CurtailmentBanner = OperationalRiskBanner;
