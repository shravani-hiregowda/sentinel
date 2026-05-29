import { theme } from "./theme";

export default function Button({ children, variant = "primary", ...props }) {
  const styles = {
    primary: {
      background: "var(--color-primary)",
      color: "#fff",
      boxShadow: "var(--shadow-sm)",
    },
    danger: {
      background: "var(--color-danger)",
      color: "#fff",
      boxShadow: "var(--shadow-sm)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-main)",
      border: `1px solid var(--color-border)`,
    },
  };

  const handleMouseEnter = (e) => {
    e.currentTarget.style.transform = "translateY(-1px)";
    e.currentTarget.style.boxShadow = "var(--shadow-md)";
    if (variant === "primary") e.currentTarget.style.background = "var(--color-primary-hover)";
    if (variant === "danger") e.currentTarget.style.background = "var(--color-danger-hover)";
    if (variant === "ghost") e.currentTarget.style.background = "var(--color-bg-body)";
  };

  const handleMouseLeave = (e) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = variant === "ghost" ? "none" : "var(--shadow-sm)";
    if (variant === "primary") e.currentTarget.style.background = "var(--color-primary)";
    if (variant === "danger") e.currentTarget.style.background = "var(--color-danger)";
    if (variant === "ghost") e.currentTarget.style.background = "transparent";
  };

  const handleMouseDown = (e) => {
    e.currentTarget.style.transform = "scale(0.97)";
  };

  const handleMouseUp = (e) => {
    e.currentTarget.style.transform = "translateY(-1px)";
  };

  return (
    <button
      {...props}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{
        padding: "8px 16px",
        borderRadius: "var(--radius-md)",
        border: variant === "ghost" ? "1px solid var(--color-border)" : "none",
        cursor: "pointer",
        fontWeight: 500,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        ...styles[variant],
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  );
}
