import { useState } from "react";
import { changePasswordApi } from "../api/adminApi";
import { useNavigate } from "react-router-dom";

// Calculate strength 0 to 4
const strength = (p) =>
  [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;

const getStrengthDetails = (score) => {
  if (score === 0) return { label: "Very Weak", color: "#E5E7EB" };
  if (score === 1) return { label: "Weak", color: "#EF4444" };
  if (score === 2) return { label: "Fair", color: "#F59E0B" };
  if (score === 3) return { label: "Good", color: "#3B82F6" };
  return { label: "Strong", color: "#10B981" };
};

export default function ForcePasswordChange() {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const score = newPass ? strength(newPass) : 0;
  const { label: strengthLabel, color: strengthColor } = getStrengthDetails(score);

  const submit = async (e) => {
    e.preventDefault();
    if (score < 3) {
      setError("Please choose a stronger password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await changePasswordApi({ oldPassword: oldPass, newPassword: newPass });
      navigate("/login");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h2 style={title}>Update Password</h2>
        <p style={subtitle}>
          For your security, you must change your password before continuing.
        </p>

        {error && <div style={errorBox}>{error}</div>}

        <form onSubmit={submit}>
          <label style={label}>Current Password</label>
          <input
            type="password"
            placeholder="Enter current password"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            style={input}
            required
          />

          <label style={label}>New Password</label>
          <input
            type="password"
            placeholder="Create a new password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            style={input}
            required
          />

          {/* STRENGTH METER */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: "#6B7280", fontWeight: 500 }}>Password Strength</span>
              <span style={{ color: strengthColor, fontWeight: 600 }}>{newPass ? strengthLabel : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  style={{
                    height: 6,
                    flex: 1,
                    borderRadius: 3,
                    background: newPass && level <= score ? strengthColor : "#E5E7EB",
                    transition: "background 0.3s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              Must be at least 8 chars, include an uppercase letter, a number, and a symbol.
            </div>
          </div>

          <button
            type="submit"
            disabled={score < 3 || loading}
            style={{
              ...button,
              opacity: score < 3 || loading ? 0.6 : 1,
              cursor: score < 3 || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
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
  padding: "36px 32px",
  borderRadius: 16,
  boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
  boxSizing: "border-box",
};

const title = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#111827",
  textAlign: "center",
};

const subtitle = {
  marginTop: 8,
  marginBottom: 24,
  textAlign: "center",
  color: "#6B7280",
  fontSize: 14,
  lineHeight: 1.5,
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
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  marginBottom: 16,
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

const button = {
  width: "100%",
  padding: "12px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  transition: "all 0.2s ease",
};

const errorBox = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "10px 12px",
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 13,
  textAlign: "center",
};
