"use client";

import type { NetLoadForecast } from "@/lib/api";

interface HostingRiskBannerProps {
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

export function HostingRiskBanner({ forecast }: HostingRiskBannerProps) {
  if (!forecast) return null;

  const anyRisk = forecast.any_hosting_risk ?? forecast.any_curtailment_risk;
  const when = anyRisk ? firstRiskTime(forecast) : null;
  const threshold =
    forecast.risk_threshold_mw ?? forecast.curtailment_threshold_mw;
  const ramp = forecast.evening_ramp_mw;

  if (!anyRisk && (ramp == null || ramp === 0)) return null;

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
            {anyRisk ? "Net-load / hosting risk" : "Evening ramp watch"}
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
            ? `Net load below zone hosting threshold around ${when}. `
            : `Net load dips below zone hosting-risk threshold. `
          : ""}
        {ramp != null
          ? `Midday→evening ramp ≈ ${ramp} MW into TOU 18:30–22:30. `
          : ""}
        Forecast/dispatch visibility signal — not published CEB curtailment GWh.
        Prefer oil ramp-down 60–90 min ahead; conserve hydro for evening peak;
        avoid solar curtailment by default.
      </p>
    </aside>
  );
}

export const CurtailmentBanner = HostingRiskBanner;
