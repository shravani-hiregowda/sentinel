import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerOrg } from "../api/adminApi";

export default function CreateOrg() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    orgName: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await registerOrg(formData);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>Create Organization</h1>
        <p style={subtitle}>Register a new tenant in Sentinel</p>

        {error && <div style={errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={label}>Organization Name</label>
          <input
            style={input}
            type="text"
            required
            value={formData.orgName}
            onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
            placeholder="e.g. Acme Corp"
          />

          <label style={label}>Admin Full Name</label>
          <input
            style={input}
            type="text"
            required
            value={formData.adminName}
            onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
            placeholder="John Doe"
          />

          <label style={label}>Admin Email</label>
          <input
            style={input}
            type="email"
            required
            value={formData.adminEmail}
            onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
            placeholder="admin@acme.com"
          />

          <label style={label}>Admin Password</label>
          <input
            style={input}
            type="password"
            required
            value={formData.adminPassword}
            onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
            placeholder="••••••••"
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
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
        <p style={footer}>
          Already have an account? <Link to="/">Login here</Link>
        </p>
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
  width: 400,
  background: "#FFFFFF",
  padding: "32px 28px",
  borderRadius: 16,
  boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
};

const title = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  textAlign: "center",
};

const subtitle = {
  marginTop: 6,
  marginBottom: 24,
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
  boxSizing: "border-box",
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
  fontSize: 13,
  color: "#6B7280",
};
