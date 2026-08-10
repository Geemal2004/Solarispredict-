"use client";

import { formatPlaybackClock } from "@/lib/mapPlayback";
import type { NetLoadPoint } from "@/lib/api";

interface TimelineSliderProps {
  points: NetLoadPoint[];
  hourIndex: number;
  onHourIndexChange: (index: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  loading?: boolean;
  zoneLabel?: string;
  horizonLabel?: string;
}

export function TimelineSlider({
  points,
  hourIndex,
  onHourIndexChange,
  playing,
  onPlayingChange,
  loading,
  zoneLabel,
  horizonLabel = "48h",
}: TimelineSliderProps) {
  const max = Math.max(0, points.length - 1);
  const point = points[hourIndex];
  const risk = point?.hosting_risk || point?.curtailment_risk;
  const tou = point?.tou_peak;

  return (
    <div className="scada-panel">
      <div className="scada-panel-header">
        <div>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            Forecast timeline
          </h2>
          <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
            {zoneLabel ? `${zoneLabel} · ` : ""}
            {horizonLabel} playback · Asia/Colombo
            {loading ? " · UPDATING" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {risk ? (
            <span className="border border-[var(--risk)]/50 px-1.5 py-0.5 font-mono-readout text-[0.6rem] text-[var(--risk)]">
              NET-LOAD RISK
            </span>
          ) : null}
          {tou ? (
            <span className="border border-[var(--solar)]/50 px-1.5 py-0.5 font-mono-readout text-[0.6rem] text-[var(--solar)]">
              TOU PEAK
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={playing ? "Pause playback" : "Play playback"}
            onClick={() => onPlayingChange(!playing)}
            disabled={points.length === 0}
            className={[
              "inline-flex h-9 w-9 items-center justify-center border outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--solar)]",
              playing
                ? "border-[var(--solar)] bg-[var(--solar-wash)] text-[var(--solar)]"
                : "border-[var(--line)] bg-[var(--mist)] text-[var(--foreground)]",
              points.length === 0 ? "opacity-40" : "",
            ].join(" ")}
          >
            {playing ? (
              <span aria-hidden className="flex gap-0.5">
                <span className="h-3 w-1 bg-current" />
                <span className="h-3 w-1 bg-current" />
              </span>
            ) : (
              <span
                aria-hidden
                className="ml-0.5 border-y-[6px] border-l-[10px] border-y-transparent border-l-current"
              />
            )}
          </button>
          <button
            type="button"
            aria-label="Reset to start"
            onClick={() => {
              onPlayingChange(false);
              onHourIndexChange(0);
            }}
            disabled={points.length === 0}
            className="font-mono-readout border border-[var(--line)] bg-[var(--mist)] px-2 py-1.5 text-[0.65rem] text-[var(--ink-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--solar)] disabled:opacity-40"
          >
            RESET
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="font-mono-readout text-sm text-[var(--foreground)]">
              {point ? formatPlaybackClock(point.timestamp) : "—"}
            </p>
            <p className="font-mono-readout text-[0.65rem] text-[var(--ink-muted)]">
              H{String(hourIndex).padStart(2, "0")} / {String(max).padStart(2, "0")}
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={max || 0}
            step={1}
            value={Math.min(hourIndex, max)}
            disabled={points.length === 0}
            onChange={(e) => {
              onPlayingChange(false);
              onHourIndexChange(Number(e.target.value));
            }}
            aria-label="Forecast hour"
            className="timeline-range w-full"
          />
          <div className="mt-1 flex justify-between font-mono-readout text-[0.6rem] text-[var(--ink-muted)]">
            <span>T+0h</span>
            <span>T+{max}h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
