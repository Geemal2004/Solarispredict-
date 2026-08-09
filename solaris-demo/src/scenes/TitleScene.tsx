import { AbsoluteFill, useCurrentFrame } from "remotion";
import { StatusChip } from "../components/StatusChip";
import { fadeIn, fadeOut, fadeUp } from "../lib/motion";
import { colors, fonts } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const brand = fadeUp(frame, 8, 22);
  const line = fadeUp(frame, 28, 20);
  const chip = fadeIn(frame, 40, 16);
  const out = frame > 200 ? fadeOut(frame, 210, 20) : 1;

  return (
    <AbsoluteFill
      style={{
        opacity: out,
        justifyContent: "center",
        padding: "0 96px",
      }}
    >
      <div style={{ opacity: chip, marginBottom: 28 }}>
        <StatusChip label="System Control · EST mode" tone="warn" />
      </div>

      <h1
        style={{
          margin: 0,
          opacity: brand.opacity,
          transform: `translateY(${brand.translateY}px)`,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 72,
          letterSpacing: "-0.03em",
          color: colors.foreground,
          lineHeight: 1.05,
        }}
      >
        SolarisPredict-SL
      </h1>

      <p
        style={{
          margin: "22px 0 0",
          maxWidth: 720,
          opacity: line.opacity,
          transform: `translateY(${line.translateY}px)`,
          fontFamily: fonts.body,
          fontSize: 26,
          lineHeight: 1.45,
          color: colors.readout,
        }}
      >
        A net-load co-pilot for Sri Lanka&apos;s grid — so operators can see the
        dip coming, and choose what to ramp before they cut solar.
      </p>
    </AbsoluteFill>
  );
};
