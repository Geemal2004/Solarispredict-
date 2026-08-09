"use client";

export function ForecastSourceBadges() {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      aria-label="Forecast methodology legend"
    >
      <span className="inline-flex items-center gap-1.5 border border-[var(--solar)]/45 bg-[var(--solar-wash)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--solar)]">
        <span className="status-led status-led-warn" aria-hidden />
        SOLAR · MODEL
      </span>
      <span className="inline-flex items-center gap-1.5 border border-[var(--demand)]/40 bg-[var(--mist)] px-2 py-0.5 font-mono-readout text-[0.65rem] text-[var(--demand)]">
        <span className="status-led" style={{ background: "var(--demand)" }} aria-hidden />
        DEMAND · PATTERN
      </span>
    </div>
  );
}
