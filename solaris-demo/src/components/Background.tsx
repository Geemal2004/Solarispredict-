import { AbsoluteFill } from "remotion";
import { colors } from "../theme";

export const Background: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        backgroundImage:
          "radial-gradient(ellipse 80% 55% at 15% 20%, rgba(232,163,61,0.07), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 80%, rgba(110,182,255,0.05), transparent 50%)",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.045,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </AbsoluteFill>
  );
};
