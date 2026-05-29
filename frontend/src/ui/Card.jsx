import { theme } from "./theme";

export default function Card({ title, value, tone = "default" }) {
  const colorMap = {
    default: "var(--color-text-main)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    success: "var(--color-success)",
  };

  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        minWidth: 200,
        border: `1px solid var(--color-border)`,
        boxShadow: "var(--shadow-sm)",
        transition: "var(--transition-normal)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow-lg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
    >
      <div style={{ color: "var(--color-text-muted)", fontSize: 13, letterSpacing: "0.5px", fontWeight: 500 }}>
        {title.toUpperCase()}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 32,
          fontWeight: 700,
          color: colorMap[tone],
          letterSpacing: "-0.5px"
        }}
      >
        {value}
      </div>
    </div>
  );
}
