"use client";

import type { DispatchAdvisory } from "@/lib/api";

interface DispatchAdvisoryPanelProps {
  advisory: DispatchAdvisory | null;
  loading?: boolean;
  compact?: boolean;
}

function severityLabel(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes("hosting") || s.includes("curtailment")) return "HOSTING RISK";
  if (s.includes("sustained")) return "SUSTAINED DIP";
  if (s === "normal") return "NORMAL";
  return severity.replace(/_/g, " ").toUpperCase();
}

function actionLabel(action: string, plant: string, mw: number | null): string {
  if (action === "hold_min_stable") return `Hold ${plant} at min stable`;
  if (action === "keep_reduced") return `Keep ${plant} reduced`;
  if (action === "must_run_no_curtail") return `Must-run ${plant} — no curtail`;
  if (action === "conserve_for_tou") return `Conserve ${plant} for TOU peak`;
  if (action === "reduce")
    return mw != null ? `Reduce ${plant} · ~${mw} MW` : `Reduce ${plant}`;
  return `${action} · ${plant}`;
}

export function DispatchAdvisoryPanel({
  advisory,
  loading,
}: DispatchAdvisoryPanelProps) {
  if (loading && !advisory) {
    return (
      <div className="scada-panel px-4 py-8 text-center">
        <p className="font-body animate-pulse text-sm text-[var(--ink-muted)]">
          Computing merit-order advisory…
        </p>
      </div>
    );
  }

  if (!advisory) return null;

  const alarm = advisory.any_risk;

  return (
    <section className="scada-panel">
      <div className="scada-panel-header">
        <div className="flex items-center gap-2">
          <span
            className={[
              "status-led",
              alarm ? "status-led-alarm animate-blink-alarm" : "status-led-ok",
            ].join(" ")}
          />
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            Dispatch advisory
          </h2>
        </div>
        <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
          {advisory.zone.toUpperCase()} · {advisory.hours}h · THR{" "}
          {advisory.threshold_mw.toFixed(0)} MW
        </p>
      </div>

      <ol className="divide-y divide-[var(--line)]">
        {advisory.recommendations.map((rec, i) => {
          const isAlarm = rec.severity !== "normal";
          return (
            <li key={`${rec.timestamp}-${i}`} className="px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "font-mono-readout text-[0.65rem] font-semibold tracking-wide",
                    isAlarm ? "text-[var(--risk)]" : "text-[var(--ok)]",
                  ].join(" ")}
                >
                  {severityLabel(rec.severity)}
                </span>
                {rec.timestamp ? (
                  <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                    {new Date(rec.timestamp).toLocaleString("en-LK", {
                      timeZone: "Asia/Colombo",
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
                <span className="ml-auto border border-[var(--line)] bg-[var(--mist)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--readout)]">
                  CONF {(rec.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="font-body mt-2 text-sm leading-relaxed text-[var(--foreground)]">
                {rec.text}
              </p>
              {rec.actions && rec.actions.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {rec.actions.map((a) => (
                    <li
                      key={`${a.plant}-${a.action}`}
                      className="flex flex-wrap items-center justify-between gap-2 border border-[var(--line)] bg-[var(--mist)] px-2.5 py-1.5"
                    >
                      <span className="font-display text-xs font-medium text-[var(--foreground)]">
                        {actionLabel(a.action, a.plant, a.mw)}
                      </span>
                      <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                        {(a.confidence * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="border-t border-[var(--line)] px-3 py-2 font-body text-[0.65rem] leading-relaxed text-[var(--ink-muted)] sm:px-4">
        {advisory.methodology}
      </p>
    </section>
  );
}
