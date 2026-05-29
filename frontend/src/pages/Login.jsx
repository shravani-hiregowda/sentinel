import { useState } from "react";
import { loginApi } from "../api/adminApi";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await loginApi(email, password);
      login(data.token, data.user);

      if (data.requirePasswordChange) {
        navigate("/force-password-change");
      } else {
        navigate(
          data.user.role === "ADMIN"
            ? "/admin/dashboard"
            : "/member/tasks"
        );
      }
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        {/* BRAND */}
        <h1 style={title}>Sentinel</h1>
        <p style={subtitle}>Secure Task Governance Platform</p>

        {/* ERROR */}
        {error && <div style={errorBox}>{error}</div>}

        {/* FORM */}
        <form onSubmit={submit}>
          <label style={label}>Email</label>
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@sentinel.io"
            required
          />

          <label style={label}>Password</label>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <button
            type="submit"
            style={{
              ...button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* FOOTER */}
        <p style={footer}>
          Don't have an organization? <Link to="/register">Create one</Link>
        </p>
        <p style={{...footer, marginTop: 12}}>© {new Date().getFullYear()} Sentinel</p>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const page = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #F9FAFB, #EEF2FF)",
  fontFamily: "Inter, system-ui, sans-serif",
};

const card = {
  width: 380,
  background: "#FFFFFF",
  padding: "32px 28px",
  borderRadius: 16,
  boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
};

const title = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  textAlign: "center",
};

const subtitle = {
  marginTop: 6,
  marginBottom: 28,
  textAlign: "center",
  color: "#6B7280",
  fontSize: 14,
};

const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  marginBottom: 16,
  fontSize: 14,
  outline: "none",
};

const button = {
  width: "100%",
  marginTop: 10,
  padding: "12px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
};

const errorBox = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "10px 12px",
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 13,
};

const footer = {
  marginTop: 24,
  textAlign: "center",
  fontSize: 12,
  color: "#9CA3AF",
};
