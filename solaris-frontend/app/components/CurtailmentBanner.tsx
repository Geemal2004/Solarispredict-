"use client";

import type { NetLoadForecast } from "@/lib/api";
import { operationalRiskLabel, operationalRiskLevel } from "@/lib/opsAnalytics";

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

  const threshold =
    forecast.risk_threshold_mw ?? forecast.curtailment_threshold_mw ?? 375;
  const riskIntervals = forecast.points.filter(
    (p) => p.hosting_risk || p.curtailment_risk
  ).length;
  const minNet = Math.min(...forecast.points.map((p) => p.net_load_mw), Infinity);
  const risk = operationalRiskLevel(minNet, threshold, riskIntervals);
  const riskLabel = operationalRiskLabel(risk);
  const when = riskIntervals > 0 ? firstRiskTime(forecast) : null;
  const ramp = forecast.evening_ramp_mw;

  if (risk === "low" && (ramp == null || ramp === 0)) return null;

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
              risk === "high"
                ? "status-led-alarm animate-blink-alarm"
                : "status-led-warn",
            ].join(" ")}
          />
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--risk)]">
            {riskLabel}
          </p>
        </div>
        {threshold != null ? (
          <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            THR {threshold.toFixed(0)} MW net load
          </span>
        ) : null}
      </div>
      <p className="px-3 py-2.5 font-body text-sm leading-relaxed text-[var(--foreground)] sm:px-4">
        {when ? `Elevated net-load stress expected around ${when}. ` : ""}
        {ramp != null
          ? `Midday→evening ramp ≈ ${ramp} MW into TOU 18:30–22:30. `
          : ""}
        Net-load operational risk — not distribution hosting capacity. Prefer oil
        ramp-down 60–90 min ahead; conserve hydro for evening peak.
      </p>
    </aside>
  );
}

export const HostingRiskBanner = OperationalRiskBanner;
export const CurtailmentBanner = OperationalRiskBanner;
