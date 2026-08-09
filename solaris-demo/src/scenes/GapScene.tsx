import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { fadeIn, fadeOut, fadeUp } from "../lib/motion";
import { colors, fonts } from "../theme";

export const GapScene: React.FC = () => {
  const frame = useCurrentFrame();
  const header = fadeUp(frame, 4, 16);
  const left = fadeUp(frame, 24, 18);
  const right = fadeUp(frame, 48, 18);
  const merge = fadeIn(frame, 160, 24);
  const out = frame > 380 ? fadeOut(frame, 385, 20) : 1;

  const bridgeWidth = interpolate(frame, [160, 220], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: out, padding: "72px 96px" }}>
      <p
        style={{
          margin: 0,
          opacity: header.opacity,
          transform: `translateY(${header.translateY}px)`,
          fontFamily: fonts.mono,
          fontSize: 14,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: colors.demand,
        }}
      >
        The research gap
      </p>
      <h2
        style={{
          margin: "12px 0 40px",
          opacity: header.opacity,
          transform: `translateY(${header.translateY}px)`,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 40,
          color: colors.foreground,
          letterSpacing: "-0.02em",
        }}
      >
        Sri Lanka already forecasts solar. And demand. Separately.
      </h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 36,
        }}
      >
        <div
          style={{
            flex: 1,
            opacity: left.opacity,
            transform: `translateY(${left.translateY}px)`,
            border: `1px solid ${colors.line}`,
            backgroundColor: colors.panel,
            padding: 28,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: colors.solar,
            }}
          >
            Solar forecast
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: fonts.body,
              fontSize: 20,
              color: colors.readout,
              lineHeight: 1.4,
            }}
          >
            Irradiance → generation. Useful. Incomplete for dispatch.
          </p>
        </div>

        <div
          style={{
            width: 72,
            height: 4,
            backgroundColor: colors.mist,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${bridgeWidth}%`,
              backgroundColor: colors.monsoon,
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            opacity: right.opacity,
            transform: `translateY(${right.translateY}px)`,
            border: `1px solid ${colors.line}`,
            backgroundColor: colors.panel,
            padding: 28,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: colors.demand,
            }}
          >
            Demand forecast
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: fonts.body,
              fontSize: 20,
              color: colors.readout,
              lineHeight: 1.4,
            }}
          >
            Load shape by day-type. Still not what the control room steers on.
          </p>
        </div>
      </div>

      <div
        style={{
          opacity: merge,
          border: `1px solid ${colors.monsoon}55`,
          backgroundColor: "rgba(62, 207, 142, 0.08)",
          padding: "28px 32px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: fonts.mono,
            fontSize: 13,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: colors.monsoon,
          }}
        >
          What operators actually need
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: fonts.display,
            fontSize: 32,
            fontWeight: 600,
            color: colors.foreground,
            letterSpacing: "-0.02em",
          }}
        >
          Net load = demand − solar — with enough lead time to act.
        </p>
      </div>
    </AbsoluteFill>
  );
};
