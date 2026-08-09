import { AbsoluteFill, useCurrentFrame } from "remotion";
import { StatusChip } from "../components/StatusChip";
import { fadeIn, fadeUp } from "../lib/motion";
import { colors, fonts } from "../theme";

export const CloseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const brand = fadeUp(frame, 8, 20);
  const line = fadeUp(frame, 28, 18);
  const honesty = fadeIn(frame, 70, 18);
  const chips = fadeIn(frame, 110, 16);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: "0 96px",
      }}
    >
      <h1
        style={{
          margin: 0,
          opacity: brand.opacity,
          transform: `translateY(${brand.translateY}px)`,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 56,
          letterSpacing: "-0.03em",
          color: colors.foreground,
        }}
      >
        SolarisPredict-SL
      </h1>

      <p
        style={{
          margin: "18px 0 0",
          maxWidth: 780,
          opacity: line.opacity,
          transform: `translateY(${line.translateY}px)`,
          fontFamily: fonts.body,
          fontSize: 26,
          lineHeight: 1.45,
          color: colors.readout,
        }}
      >
        Forecast the net-load dip. Ramp oil first. Hold hydro for the evening
        peak. Keep solar online when the grid can take it.
      </p>

      <p
        style={{
          margin: "28px 0 0",
          maxWidth: 720,
          opacity: honesty,
          fontFamily: fonts.body,
          fontSize: 18,
          lineHeight: 1.5,
          color: colors.inkMuted,
        }}
      >
        Estimated from live weather and published demand patterns — not live CEB
        SCADA. Honest about provenance so operators and judges can trust the
        method.
      </p>

      <div
        style={{
          marginTop: 32,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          opacity: chips,
        }}
      >
        <StatusChip label="NOT SCADA" tone="warn" />
        <StatusChip label="Weather + published patterns" tone="ok" />
        <StatusChip label="Merit-order advisory" tone="ok" />
      </div>
    </AbsoluteFill>
  );
};
