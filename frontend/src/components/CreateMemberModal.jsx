import { useState } from "react";
import { createMemberApi } from "../api/adminApi";

export default function CreateMemberModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("All fields are required");
      return;
    }

    try {
      setLoading(true);
      await createMemberApi({ name, email, password, phone });
      onClose();
      onCreated?.();

      // reset
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to create member"
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
          <h2 style={{ margin: 0 }}>Add Member</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <p style={subtitle}>
          Create a new member account. The user can change their password after login.
        </p>

        {/* ERROR */}
        {error && <div style={errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={section}>
            <label style={label}>Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              style={input}
            />
          </div>

          <div style={section}>
            <label style={label}>Email Address</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@company.com"
              style={input}
            />
          </div>

          <div style={section}>
            <label style={label}>Phone Number (Optional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
              style={input}
            />
            <small style={hint}>For SMS Notifications</small>
          </div>

          <div style={section}>
            <label style={label}>Temporary Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set initial password"
              style={input}
            />
            <small style={hint}>
              Member will be prompted to change this password
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
              style={{
                ...submitBtn,
                opacity: loading ? 0.7 : 1,
              }}
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Member"}
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
