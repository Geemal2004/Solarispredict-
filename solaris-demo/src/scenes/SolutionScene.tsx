import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Panel } from "../components/Panel";
import { fadeIn, fadeOut, fadeUp } from "../lib/motion";
import { colors, fonts } from "../theme";

function MiniChart({ frame }: { frame: number }) {
  const progress = interpolate(frame, [20, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const solar = Math.max(0, Math.sin((t - 0.15) * Math.PI) * 0.85) * progress;
    const demand =
      (0.55 + 0.2 * Math.sin(t * Math.PI * 2) + (t > 0.7 ? 0.18 : 0)) *
      progress;
    const net = Math.max(0.08, demand - solar * 0.9);
    return { solar, demand, net };
  });

  const w = 340;
  const h = 120;
  const toPath = (key: "solar" | "demand" | "net") =>
    pts
      .map((p, i) => {
        const x = (i / 23) * w;
        const y = h - p[key] * h * 0.85;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={toPath("demand")} fill="none" stroke={colors.demand} strokeWidth={2.5} />
      <path d={toPath("solar")} fill="none" stroke={colors.solar} strokeWidth={2.5} />
      <path d={toPath("net")} fill="none" stroke={colors.monsoon} strokeWidth={3} />
    </svg>
  );
}

function MiniMap({ frame }: { frame: number }) {
  const pulse = 0.65 + 0.35 * Math.sin(frame / 8);
  const plants = [
    { x: 48, y: 92, c: colors.solar, s: 10 },
    { x: 72, y: 118, c: colors.solar, s: 8 },
    { x: 110, y: 55, c: "#2E2E2E", s: 14 },
    { x: 95, y: 140, c: "#B5533C", s: 11 },
    { x: 130, y: 100, c: "#1B2A4A", s: 12 },
    { x: 145, y: 70, c: "#1B2A4A", s: 9 },
    { x: 60, y: 40, c: "#2E7D6B", s: 10 },
  ];

  return (
    <svg width={200} height={180} viewBox="0 0 200 200">
      <ellipse
        cx={100}
        cy={100}
        rx={55}
        ry={78}
        fill={colors.mist}
        stroke={colors.line}
        strokeWidth={2}
      />
      {plants.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.s * (p.c === colors.solar ? pulse : 1)}
          fill={p.c}
          opacity={0.9}
        />
      ))}
    </svg>
  );
}

const actions = [
  { plant: "Kerawalapitiya", action: "Reduce ~45 MW", conf: 92 },
  { plant: "Sapugaskanda", action: "Reduce ~20 MW", conf: 88 },
  { plant: "Lakvijaya", action: "Hold min stable", conf: 95 },
  { plant: "Solar fleet", action: "No curtailment", conf: 90 },
];

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const header = fadeUp(frame, 4, 16);
  const p1 = fadeUp(frame, 30, 18);
  const p2 = fadeUp(frame, 160, 18);
  const p3 = fadeUp(frame, 340, 18);
  const out = frame > 950 ? fadeOut(frame, 955, 20) : 1;

  const showMap = frame >= 140;
  const showAdv = frame >= 320;

  return (
    <AbsoluteFill style={{ opacity: out, padding: "56px 72px" }}>
      <p
        style={{
          margin: 0,
          opacity: header.opacity,
          transform: `translateY(${header.translateY}px)`,
          fontFamily: fonts.mono,
          fontSize: 14,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: colors.solar,
        }}
      >
        What we built
      </p>
      <h2
        style={{
          margin: "10px 0 28px",
          opacity: header.opacity,
          transform: `translateY(${header.translateY}px)`,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 36,
          color: colors.foreground,
          letterSpacing: "-0.02em",
        }}
      >
        Observe → forecast → recommend.
      </h2>

      <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
        <div
          style={{
            flex: 1.15,
            opacity: p1.opacity,
            transform: `translateY(${p1.translateY}px)`,
          }}
        >
          <Panel title="Zone net-load forecast">
            <MiniChart frame={frame} />
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 12,
                fontFamily: fonts.mono,
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.inkMuted,
              }}
            >
              <span style={{ color: colors.solar }}>Solar</span>
              <span style={{ color: colors.demand }}>Demand</span>
              <span style={{ color: colors.monsoon }}>Net load</span>
            </div>
          </Panel>
        </div>

        {showMap ? (
          <div
            style={{
              width: 220,
              opacity: p2.opacity,
              transform: `translateY(${p2.translateY}px)`,
            }}
          >
            <Panel title="National map">
              <div style={{ display: "flex", justifyContent: "center" }}>
                <MiniMap frame={frame} />
              </div>
            </Panel>
          </div>
        ) : (
          <div style={{ width: 220 }} />
        )}

        {showAdv ? (
          <div
            style={{
              flex: 1,
              opacity: p3.opacity,
              transform: `translateY(${p3.translateY}px)`,
            }}
          >
            <Panel title="Dispatch advisory">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actions.map((a, i) => {
                  const o = fadeIn(frame, 360 + i * 28, 14);
                  return (
                    <div
                      key={a.plant}
                      style={{
                        opacity: o,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        borderBottom: `1px solid ${colors.line}`,
                        paddingBottom: 8,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: fonts.display,
                            fontSize: 15,
                            fontWeight: 600,
                            color: colors.foreground,
                          }}
                        >
                          {a.plant}
                        </p>
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontFamily: fonts.body,
                            fontSize: 14,
                            color: colors.readout,
                          }}
                        >
                          {a.action}
                        </p>
                      </div>
                      <span
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 13,
                          color: colors.monsoon,
                        }}
                      >
                        {a.conf}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>
    </AbsoluteFill>
  );
};
