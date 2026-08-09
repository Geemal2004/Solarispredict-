"use client";

export const FORECAST_HORIZONS = [
  { hours: 24, label: "24h", note: "1 day" },
  { hours: 48, label: "48h", note: "2 days" },
  { hours: 72, label: "72h", note: "3 days" },
  { hours: 168, label: "7d", note: "1 week" },
] as const;

export type ForecastHorizonHours = (typeof FORECAST_HORIZONS)[number]["hours"];

interface HorizonSelectorProps {
  value: ForecastHorizonHours;
  onChange: (hours: ForecastHorizonHours) => void;
  disabled?: boolean;
}

export function HorizonSelector({
  value,
  onChange,
  disabled,
}: HorizonSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Forecast time range"
      className="flex flex-wrap gap-1"
    >
      {FORECAST_HORIZONS.map((h) => {
        const selected = h.hours === value;
        return (
          <button
            key={h.hours}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={h.note}
            onClick={() => onChange(h.hours)}
            className={[
              "font-mono-readout min-w-[3.25rem] border px-2 py-1 text-[0.65rem] uppercase tracking-wide outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
              selected
                ? "border-[var(--demand)] bg-[var(--mist)] text-[var(--solar)]"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--demand)]/50 hover:text-[var(--foreground)]",
              disabled ? "cursor-wait opacity-60" : "cursor-pointer",
            ].join(" ")}
          >
            {h.label}
          </button>
        );
      })}
    </div>
  );
}

export function formatHorizonLabel(hours: number): string {
  const match = FORECAST_HORIZONS.find((h) => h.hours === hours);
  return match?.label ?? `${hours}h`;
}
