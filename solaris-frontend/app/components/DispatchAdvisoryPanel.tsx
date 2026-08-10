"use client";

import type { DispatchAction, DispatchAdvisory } from "@/lib/api";

interface DispatchAdvisoryPanelProps {
  advisory: DispatchAdvisory | null;
  loading?: boolean;
  compact?: boolean;
  scheduleMode?: boolean;
}

function shortPlant(name: string): string {
  return name.split(" (")[0].trim();
}

function severityLabel(severity: string): string {
  const s = severity.toLowerCase();
  if (s.includes("hosting") || s.includes("curtailment") || s.includes("risk"))
    return "HIGH OPERATIONAL RISK";
  if (s.includes("sustained")) return "MODERATE OPERATIONAL RISK";
  if (s === "normal") return "LOW OPERATIONAL RISK";
  return severity.replace(/_/g, " ").toUpperCase();
}

function formatAction(a: DispatchAction): string {
  if (a.schedule_line) return a.schedule_line;
  if (a.action === "hold_min_stable")
    return a.mw != null
      ? `Hold ~${a.mw} MW min stable`
      : "Hold min stable";
  if (a.action === "keep_reduced") return "Keep reduced (est.)";
  if (a.action === "must_run_no_curtail") return "Must-run — no curtail";
  if (a.action === "conserve_for_tou")
    return a.mw != null
      ? `Preserve ~${a.mw} MWh for TOU`
      : "Conserve for TOU peak";
  if (a.action === "reduce")
    return a.mw != null
      ? `−${Math.round(a.mw)} MW${a.at_time ? ` at ${a.at_time}` : ""}`
      : "Reduce (est.)";
  if (a.action === "standby" || a.action === "spinning_reserve")
    return a.at_time ? `${a.action.replace(/_/g, " ")} until ${a.at_time}` : "Reserve (est.)";
  return `${a.action.replace(/_/g, " ")} (est.)`;
}

export function DispatchAdvisoryPanel({
  advisory,
  loading,
  scheduleMode,
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
  const scheduleActions =
    advisory.recommendations.flatMap((rec) => rec.actions ?? []).slice(0, 6);

  if (scheduleMode) {
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
              Dispatch schedule
            </h2>
          </div>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            {advisory.zone.toUpperCase()} · {advisory.hours}h · THR{" "}
            {advisory.threshold_mw.toFixed(0)} MW
          </p>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {scheduleActions.map((a) => (
            <li
              key={`${a.plant}-${a.action}-${a.schedule_line}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-display font-semibold text-[var(--foreground)]">
                  {shortPlant(a.plant)}
                </p>
                <p className="font-mono-readout text-[0.72rem] text-[var(--solar)]">
                  {formatAction(a)}
                </p>
              </div>
              <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                {(a.confidence * 100).toFixed(0)}% conf.
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-[var(--line)] px-3 py-2 font-body text-[0.65rem] leading-relaxed text-[var(--ink-muted)] sm:px-4">
          {advisory.methodology}
        </p>
      </section>
    );
  }

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
              <ul className="mt-2 space-y-1">
                {(rec.actions ?? []).map((a) => (
                  <li
                    key={`${a.plant}-${a.action}`}
                    className="flex flex-wrap items-center justify-between gap-2 border border-[var(--line)] bg-[var(--mist)] px-2.5 py-1.5"
                  >
                    <span className="font-display text-xs font-medium text-[var(--foreground)]">
                      <span className="text-[var(--solar)]">{shortPlant(a.plant)}</span>
                      {" · "}
                      {formatAction(a)}
                    </span>
                    <span className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
                      est. conf. {(a.confidence * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
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
