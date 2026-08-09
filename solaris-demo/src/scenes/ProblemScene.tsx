import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { fadeIn, fadeOut, fadeUp } from "../lib/motion";
import { colors, fonts } from "../theme";

const beats = [
  {
    at: 12,
    kicker: "February 2025",
    text: "A national blackout — solar was covering more than half of demand when the grid lost stability.",
  },
  {
    at: 110,
    kicker: "What followed",
    text: "Curtailment grew from “Sunny Sunday” cuts into holidays and weekdays. Developers put the loss near Rs 2 billion.",
  },
  {
    at: 280,
    kicker: "The real bottleneck",
    text: "Operators could not see net load — demand minus solar — far enough ahead to manage the dip with thermal plant.",
  },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const header = fadeUp(frame, 4, 18);
  const out = frame > 560 ? fadeOut(frame, 565, 20) : 1;

  const solarShare = interpolate(frame, [40, 160], [18, 54], {
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
          color: colors.risk,
        }}
      >
        Why this exists
      </p>

      <h2
        style={{
          margin: "14px 0 36px",
          opacity: header.opacity,
          transform: `translateY(${header.translateY}px)`,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 44,
          letterSpacing: "-0.02em",
          color: colors.foreground,
          maxWidth: 900,
          lineHeight: 1.15,
        }}
      >
        The grid was punished for solar success — then told to cut it.
      </h2>

      <div style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}
        >
          {beats.map((beat) => {
            const opacity = fadeIn(frame, beat.at, 18);
            const y = interpolate(frame, [beat.at, beat.at + 18], [14, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={beat.kicker}
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  borderLeft: `3px solid ${colors.line}`,
                  paddingLeft: 18,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: colors.solar,
                  }}
                >
                  {beat.kicker}
                </p>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontFamily: fonts.body,
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: colors.readout,
                  }}
                >
                  {beat.text}
                </p>
              </div>
            );
          })}
        </div>

        <div
          style={{
            width: 280,
            border: `1px solid ${colors.line}`,
            backgroundColor: colors.panel,
            padding: 24,
            opacity: fadeIn(frame, 50, 20),
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: fonts.mono,
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: colors.inkMuted,
              }}
            >
              Solar share of demand
            </p>
            <p
              style={{
                margin: "12px 0 0",
                fontFamily: fonts.display,
                fontSize: 64,
                fontWeight: 600,
                color: colors.solar,
                letterSpacing: "-0.04em",
              }}
            >
              {Math.round(solarShare)}%
            </p>
          </div>
          <div
            style={{
              height: 10,
              backgroundColor: colors.mist,
              border: `1px solid ${colors.line}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${solarShare}%`,
                backgroundColor: colors.solar,
              }}
            />
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: fonts.body,
              fontSize: 15,
              color: colors.inkMuted,
              lineHeight: 1.4,
            }}
          >
            High solar is not the failure. Blind net load is.
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
