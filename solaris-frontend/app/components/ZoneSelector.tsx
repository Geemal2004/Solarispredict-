"use client";

import { ZONES, type Zone } from "@/lib/api";

interface ZoneSelectorProps {
  value: Zone;
  onChange: (zone: Zone) => void;
  disabled?: boolean;
}

export function ZoneSelector({ value, onChange, disabled }: ZoneSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Forecast zone"
      className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-3"
    >
      {ZONES.map((zone) => {
        const selected = zone.id === value;
        return (
          <button
            key={zone.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(zone.id)}
            className={[
              "group w-full border px-3 py-2.5 text-left transition-colors duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
              selected
                ? "border-[var(--demand)] bg-[var(--mist)] text-[var(--foreground)]"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--demand)]/50 hover:text-[var(--foreground)]",
              disabled ? "cursor-wait opacity-60" : "cursor-pointer",
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              <span
                className={[
                  "status-led",
                  selected ? "status-led-ok" : "status-led-idle",
                ].join(" ")}
              />
              <span className="font-display text-xs font-semibold uppercase tracking-wide">
                {zone.label}
              </span>
            </span>
            <span className="mt-0.5 block pl-4 text-[0.65rem] leading-snug text-[var(--ink-muted)]">
              {zone.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}
