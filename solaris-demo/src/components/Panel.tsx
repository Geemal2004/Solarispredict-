import { colors, fonts } from "../theme";

export const Panel: React.FC<{
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  width?: number | string;
}> = ({ title, children, style, width = "100%" }) => {
  return (
    <div
      style={{
        width,
        border: `1px solid ${colors.line}`,
        backgroundColor: colors.panel,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          borderBottom: `1px solid ${colors.line}`,
          backgroundColor: colors.panelElevated,
          padding: "10px 14px",
          fontFamily: fonts.mono,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: colors.inkMuted,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
};
