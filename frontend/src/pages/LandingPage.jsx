import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div style={container}>
      {/* ─── HEADER ─── */}
      <header style={headerStyle}>
        <div style={logoContainer}>
          <span style={logoText}>Sentinel</span>
        </div>
        <nav style={navLinks}>
          <a href="#features" style={navLink}>Features</a>
          {user ? (
            <Link
              to={user.role === "ADMIN" ? "/admin/dashboard" : "/member/tasks"}
              style={primaryBtn}
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" style={secondaryBtn}>Sign In</Link>
              <Link to="/register" style={primaryBtn}>Get Started</Link>
            </>
          )}
        </nav>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section style={heroSection}>
        <div style={heroBadge}>Governance & Accountability</div>
        <h1 style={heroTitle}>
          SLA-Driven Task Governance Platform
        </h1>
        <p style={heroSub}>
          Enforce ownership, track state transitions, and monitor SLA breaches in real-time. 
          Sentinel ensures organization-wide accountability with complete audit logs.
        </p>
        <div style={heroActions}>
          {user ? (
            <Link
              to={user.role === "ADMIN" ? "/admin/dashboard" : "/member/tasks"}
              style={ctaPrimary}
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/register" style={ctaPrimary}>Register Organization</Link>
              <Link to="/login" style={ctaSecondary}>Sign In</Link>
            </>
          )}
        </div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section id="features" style={featuresSection}>
        <h2 style={sectionTitle}>System Features</h2>
        <p style={sectionSub}>Engineered for structured operational workflows and SLA compliance.</p>
        
        <div style={featuresGrid}>
          <div style={featureCard}>
            <h3 style={cardTitle}>SLA Management</h3>
            <p style={cardDesc}>
              Acknowledge and action deadlines count down automatically. Escalation workflows trigger when deadlines are missed.
            </p>
          </div>

          <div style={featureCard}>
            <h3 style={cardTitle}>Task Audit Logs</h3>
            <p style={cardDesc}>
              Every state transition tracks the target state, actor, action, and timestamp. Unalterable records of all updates.
            </p>
          </div>

          <div style={featureCard}>
            <h3 style={cardTitle}>Role-Based Dashboard</h3>
            <p style={cardDesc}>
              Administrators orchestrate and assign tasks; members focus on acknowledging, starting, and completing work.
            </p>
          </div>

          <div style={featureCard}>
            <h3 style={cardTitle}>Structured State Transitions</h3>
            <p style={cardDesc}>
              Strict workflow enforcement (Open → Acknowledged → In Progress → Closed) ensures state machine consistency.
            </p>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={footerStyle}>
        <p style={footerText}>© {new Date().getFullYear()} Sentinel. All rights reserved.</p>
      </footer>
    </div>
  );
}

/* ────────── STYLING SYSTEM (Matching Application Variables) ────────── */

const container = {
  background: "var(--color-bg-body)",
  color: "var(--color-text-main)",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, sans-serif",
  overflowY: "auto",
  transition: "background var(--transition-normal), color var(--transition-normal)",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 40px",
  position: "sticky",
  top: 0,
  background: "var(--color-bg-card)",
  borderBottom: "1px solid var(--color-border)",
  zIndex: 100,
  boxShadow: "var(--shadow-sm)",
};

const logoContainer = {
  display: "flex",
  alignItems: "center",
};

const logoText = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.03em",
  color: "var(--color-primary)",
};

const navLinks = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

const navLink = {
  color: "var(--color-text-muted)",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 500,
  transition: "color var(--transition-fast)",
};

const primaryBtn = {
  background: "var(--color-primary)",
  color: "#FFFFFF",
  padding: "8px 16px",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  transition: "opacity var(--transition-fast)",
};

const secondaryBtn = {
  color: "var(--color-text-main)",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  transition: "color var(--transition-fast)",
};

const heroSection = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "80px 24px 60px",
  maxWidth: 800,
  margin: "0 auto",
};

const heroBadge = {
  background: "var(--color-bg-card)",
  color: "var(--color-primary)",
  padding: "6px 14px",
  borderRadius: 99,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 20,
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
};

const heroTitle = {
  fontSize: 44,
  fontWeight: 800,
  letterSpacing: "-0.025em",
  lineHeight: 1.2,
  margin: 0,
  color: "var(--color-text-main)",
};

const heroSub = {
  fontSize: 16,
  color: "var(--color-text-muted)",
  lineHeight: 1.6,
  marginTop: 16,
  marginBottom: 32,
};

const heroActions = {
  display: "flex",
  gap: 16,
};

const ctaPrimary = {
  background: "var(--color-primary)",
  color: "#FFFFFF",
  padding: "12px 24px",
  borderRadius: "var(--radius-lg)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 15,
  boxShadow: "var(--shadow-md)",
  transition: "opacity var(--transition-fast)",
};

const ctaSecondary = {
  background: "var(--color-bg-card)",
  color: "var(--color-text-main)",
  padding: "12px 24px",
  borderRadius: "var(--radius-lg)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 15,
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
  transition: "background var(--transition-fast)",
};

const featuresSection = {
  padding: "60px 40px",
  maxWidth: 1100,
  margin: "0 auto",
  textAlign: "center",
};

const sectionTitle = {
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
  color: "var(--color-text-main)",
};

const sectionSub = {
  fontSize: 15,
  color: "var(--color-text-muted)",
  marginTop: 8,
  marginBottom: 40,
};

const featuresGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 20,
};

const featureCard = {
  background: "var(--color-bg-card)",
  border: "1px solid var(--color-border)",
  padding: 24,
  borderRadius: "var(--radius-lg)",
  textAlign: "left",
  boxShadow: "var(--shadow-sm)",
};

const cardTitle = {
  fontSize: 16,
  fontWeight: 700,
  margin: "0 0 8px 0",
  color: "var(--color-text-main)",
};

const cardDesc = {
  fontSize: 13.5,
  color: "var(--color-text-muted)",
  lineHeight: 1.5,
  margin: 0,
};

const footerStyle = {
  padding: "32px 24px",
  textAlign: "center",
  borderTop: "1px solid var(--color-border)",
  background: "var(--color-bg-card)",
  marginTop: 40,
};

const footerText = {
  fontSize: 13,
  color: "var(--color-text-muted)",
  margin: 0,
};
