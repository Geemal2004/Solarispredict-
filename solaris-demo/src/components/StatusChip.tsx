import { colors, fonts } from "../theme";

export const StatusChip: React.FC<{
  label: string;
  tone?: "ok" | "warn" | "risk";
}> = ({ label, tone = "warn" }) => {
  const color =
    tone === "ok" ? colors.monsoon : tone === "risk" ? colors.risk : colors.solar;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${color}66`,
        padding: "6px 12px",
        fontFamily: fonts.mono,
        fontSize: 14,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 0 3px ${color}33`,
        }}
      />
      {label}
    </div>
  );
};
