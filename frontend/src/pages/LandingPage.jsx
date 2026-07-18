import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div style={container}>
      {/* ─── HEADER ─── */}
      <header style={headerStyle}>
        <div style={logoContainer}>
          <span style={logoEmoji}>🛡️</span>
          <span style={logoText}>Sentinel</span>
        </div>
        <nav style={navLinks}>
          <a href="#features" style={navLink}>Features</a>
          <a href="#architecture" style={navLink}>Architecture</a>
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
        <div style={heroBadge}>Enterprise Accountability</div>
        <h1 style={heroTitle}>
          SLA-Driven Task Governance <br />
          <span style={gradientText}>& Compliance Platform</span>
        </h1>
        <p style={heroSub}>
          Enforce ownership, track transition audit logs, and monitor SLA breaches in real-time. 
          Ensure no critical task falls through the cracks.
        </p>
        <div style={heroActions}>
          {user ? (
            <Link
              to={user.role === "ADMIN" ? "/admin/dashboard" : "/member/tasks"}
              style={ctaPrimary}
            >
              Enter Workspace
            </Link>
          ) : (
            <>
              <Link to="/register" style={ctaPrimary}>Create Organization</Link>
              <Link to="/login" style={ctaSecondary}>Sign In to Account</Link>
            </>
          )}
        </div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section id="features" style={featuresSection}>
        <h2 style={sectionTitle}>Why Sentinel?</h2>
        <p style={sectionSub}>Built to bring engineering discipline and SLA enforcement to operational workflows.</p>
        
        <div style={featuresGrid}>
          <div style={featureCard}>
            <div style={iconBox}>⏱️</div>
            <h3 style={cardTitle}>SLA Countdown Timers</h3>
            <p style={cardDesc}>
              Acknowledge and Action deadlines count down live. Automatic escalation algorithms trigger if SLAs are breached.
            </p>
          </div>

          <div style={featureCard}>
            <div style={iconBox}>🧾</div>
            <h3 style={cardTitle}>Strict State Audits</h3>
            <p style={cardDesc}>
              Every transition is logged with the target state, actor, action, and timestamp. A complete, unalterable audit log.
            </p>
          </div>

          <div style={featureCard}>
            <div style={iconBox}>👥</div>
            <h3 style={cardTitle}>Role-Based Dashboard</h3>
            <p style={cardDesc}>
              Admins orchestrate tasks and monitor organizations; Members focus on acknowledging, starting, and completing work.
            </p>
          </div>

          <div style={featureCard}>
            <div style={iconBox}>📊</div>
            <h3 style={cardTitle}>Interactive Kanban</h3>
            <p style={cardDesc}>
              Drag-and-drop workspace layout styled with custom CSS metrics. Visually identifies overdue or escalated tasks.
            </p>
          </div>
        </div>
      </section>

      {/* ─── ARCHITECTURE SECTION ─── */}
      <section id="architecture" style={archSection}>
        <div style={archCard}>
          <h2 style={archTitle}>Production-Style Architecture</h2>
          <p style={archDesc}>
            Sentinel is designed with modern software principles: RESTful APIs, Mongoose data normalization, 
            JWT authentication sessions, and responsive frontends styled with custom CSS variables.
          </p>
          <div style={techRow}>
            <span style={techBadge}>React</span>
            <span style={techBadge}>NodeJS</span>
            <span style={techBadge}>Express</span>
            <span style={techBadge}>MongoDB</span>
            <span style={techBadge}>WebSockets</span>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={footerStyle}>
        <p style={footerText}>© {new Date().getFullYear()} Sentinel. All rights reserved.</p>
        <p style={footerSub}>Built for high-performance engineering governance.</p>
      </footer>
    </div>
  );
}

/* ────────── STYLING SYSTEM ────────── */

const container = {
  background: "#0B0F19",
  color: "#F3F4F6",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, sans-serif",
  overflowX: "hidden",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "20px 48px",
  position: "sticky",
  top: 0,
  background: "rgba(11, 15, 25, 0.8)",
  backdropFilter: "blur(12px)",
  zIndex: 100,
  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
};

const logoContainer = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const logoEmoji = {
  fontSize: 22,
};

const logoText = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.03em",
  background: "linear-gradient(135deg, #60A5FA, #3B82F6)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const navLinks = {
  display: "flex",
  alignItems: "center",
  gap: 24,
};

const navLink = {
  color: "#9CA3AF",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 500,
  transition: "color 0.2s",
};

const primaryBtn = {
  background: "#2563EB",
  color: "#FFFFFF",
  padding: "10px 18px",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  transition: "opacity 0.2s",
};

const secondaryBtn = {
  color: "#F3F4F6",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
};

const heroSection = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "100px 24px 80px",
  maxWidth: 800,
  margin: "0 auto",
};

const heroBadge = {
  background: "rgba(59, 130, 246, 0.1)",
  color: "#60A5FA",
  padding: "6px 14px",
  borderRadius: 99,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 24,
  border: "1px solid rgba(59, 130, 246, 0.2)",
};

const heroTitle = {
  fontSize: 54,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  lineHeight: 1.15,
  margin: 0,
  color: "#FFFFFF",
};

const gradientText = {
  background: "linear-gradient(135deg, #60A5FA, #3B82F6, #1D4ED8)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const heroSub = {
  fontSize: 18,
  color: "#9CA3AF",
  lineHeight: 1.6,
  marginTop: 20,
  marginBottom: 36,
};

const heroActions = {
  display: "flex",
  gap: 16,
};

const ctaPrimary = {
  background: "#2563EB",
  color: "#FFFFFF",
  padding: "14px 28px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 16,
  boxShadow: "0 10px 20px rgba(37, 99, 235, 0.2)",
  transition: "transform 0.2s, opacity 0.2s",
};

const ctaSecondary = {
  background: "transparent",
  color: "#F3F4F6",
  padding: "14px 28px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 16,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  transition: "background 0.2s",
};

const featuresSection = {
  padding: "80px 48px",
  maxWidth: 1100,
  margin: "0 auto",
  textAlign: "center",
};

const sectionTitle = {
  fontSize: 36,
  fontWeight: 800,
  margin: 0,
};

const sectionSub = {
  fontSize: 16,
  color: "#9CA3AF",
  marginTop: 10,
  marginBottom: 48,
};

const featuresGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 24,
};

const featureCard = {
  background: "rgba(255, 255, 255, 0.02)",
  border: "1px solid rgba(255, 255, 255, 0.05)",
  padding: 32,
  borderRadius: 16,
  textAlign: "left",
  transition: "transform 0.2s, border-color 0.2s",
};

const iconBox = {
  fontSize: 28,
  marginBottom: 16,
};

const cardTitle = {
  fontSize: 18,
  fontWeight: 700,
  margin: "0 0 10px 0",
};

const cardDesc = {
  fontSize: 14,
  color: "#9CA3AF",
  lineHeight: 1.5,
  margin: 0,
};

const archSection = {
  padding: "40px 48px 80px",
  maxWidth: 1100,
  margin: "0 auto",
};

const archCard = {
  background: "linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(29, 78, 216, 0.02))",
  border: "1px solid rgba(37, 99, 235, 0.15)",
  padding: "48px 36px",
  borderRadius: 24,
  textAlign: "center",
};

const archTitle = {
  fontSize: 28,
  fontWeight: 800,
  margin: 0,
};

const archDesc = {
  fontSize: 16,
  color: "#9CA3AF",
  lineHeight: 1.6,
  maxWidth: 700,
  margin: "12px auto 28px",
};

const techRow = {
  display: "flex",
  justifyContent: "center",
  gap: 12,
  flexWrap: "wrap",
};

const techBadge = {
  background: "rgba(255, 255, 255, 0.05)",
  padding: "6px 14px",
  borderRadius: 99,
  fontSize: 13,
  fontWeight: 500,
  color: "#9CA3AF",
};

const footerStyle = {
  padding: "48px 24px",
  textAlign: "center",
  borderTop: "1px solid rgba(255, 255, 255, 0.05)",
};

const footerText = {
  fontSize: 14,
  color: "#6B7280",
  margin: 0,
};

const footerSub = {
  fontSize: 12,
  color: "#4B5563",
  marginTop: 6,
  margin: 0,
};
