import { useState } from "react";
import { changePasswordApi } from "../api/adminApi";

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!currentPassword || !newPassword) {
      setError("All fields are required");
      return;
    }

    try {
      setLoading(true);

      await changePasswordApi({
        oldPassword: currentPassword,
        newPassword,
      });

      onClose();
      setCurrentPassword("");
      setNewPassword("");
      alert("Password changed successfully ✅");
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to change password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay} className="animate-fade-in">
      <div style={modal} className="animate-slide-up">
        {/* HEADER */}
        <div style={header}>
          <h2 style={{ margin: 0 }}>Change Password</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <p style={subtitle}>
          For security reasons, choose a strong password you don’t use elsewhere.
        </p>

        {/* ERROR */}
        {error && <div style={errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={section}>
            <label style={label}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              style={input}
            />
          </div>

          <div style={section}>
            <label style={label}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Create a new password"
              style={input}
            />
            <small style={hint}>
              Use at least 8 characters with letters and numbers
            </small>
          </div>

          {/* ACTIONS */}
          <div style={actionRow}>
            <button
              type="button"
              onClick={onClose}
              style={cancelBtn}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...submitBtn,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modal = {
  width: 420,
  background: "var(--color-bg-card)",
  color: "var(--color-text-main)",
  borderRadius: 16,
  padding: 24,
  fontFamily: "Inter, system-ui, sans-serif",
  boxShadow: "var(--shadow-xl)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const closeBtn = {
  border: "none",
  background: "transparent",
  fontSize: 18,
  cursor: "pointer",
  color: "var(--color-text-muted)",
};

const subtitle = {
  marginTop: 8,
  fontSize: 14,
  color: "var(--color-text-muted)",
};

const section = {
  marginTop: 18,
};

const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-main)",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-body)",
  color: "var(--color-text-main)",
  fontSize: 14,
  outline: "none",
};

const hint = {
  fontSize: 12,
  color: "var(--color-text-muted)",
};

const actionRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  marginTop: 28,
};

const cancelBtn = {
  background: "var(--color-bg-body)",
  color: "var(--color-text-main)",
  border: "none",
  padding: "10px 14px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  transition: "var(--transition-fast)",
};

const submitBtn = {
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
  transition: "var(--transition-fast)",
};

const errorBox = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "10px 12px",
  borderRadius: 8,
  marginTop: 16,
};
