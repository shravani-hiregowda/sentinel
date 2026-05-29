import React, { useState } from "react";
import { createTaskApi } from "../api/adminApi";

export default function CreateTaskModal({ open, onClose, members, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ackDeadline, setAckDeadline] = useState("");
  const [actionDeadline, setActionDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async () => {
    setError("");

    if (!title || !description || !ownerId || !ackDeadline || !actionDeadline) {
      setError("All fields are required");
      return;
    }

    if (new Date(actionDeadline) <= new Date(ackDeadline)) {
      setError("Action deadline must be after ACK deadline");
      return;
    }

    try {
      setLoading(true);

      await createTaskApi({
        title,
        description,
        ownerId,
        ackDeadline: new Date(ackDeadline).toISOString(),
        actionDeadline: new Date(actionDeadline).toISOString(),
      });

      onClose();
      onCreated?.();

      // reset
      setTitle("");
      setDescription("");
      setOwnerId("");
      setAckDeadline("");
      setActionDeadline("");
    } catch {
      setError("Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay} className="animate-fade-in">
      <div style={modal} className="animate-slide-up">
        {/* HEADER */}
        <div style={header}>
          <h2 style={{ margin: 0 }}>Create Task</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* ERROR */}
        {error && <div style={errorBox}>{error}</div>}

        {/* SECTION: DETAILS */}
        <div style={section}>
          <label style={label}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, clear task title"
            style={input}
          />

          <label style={label}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain what needs to be done"
            style={{ ...input, height: 90 }}
          />
        </div>

        {/* SECTION: OWNER */}
        <div style={section}>
          <label style={label}>Assign To</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            style={input}
          >
            <option value="">Select member</option>
            {members.map((m) => (
              <option key={m.member.id} value={m.member.id}>
                {m.member.name} — {m.member.email}
              </option>
            ))}
          </select>
        </div>

        {/* SECTION: DEADLINES */}
        <div style={deadlineGrid}>
          <div>
            <label style={label}>ACK Deadline</label>
            <input
              type="datetime-local"
              value={ackDeadline}
              onChange={(e) => setAckDeadline(e.target.value)}
              style={input}
            />
            <small style={hint}>Time to acknowledge</small>
          </div>

          <div>
            <label style={label}>Action Deadline</label>
            <input
              type="datetime-local"
              value={actionDeadline}
              onChange={(e) => setActionDeadline(e.target.value)}
              style={input}
            />
            <small style={hint}>Final completion time</small>
          </div>
        </div>

        {/* ACTIONS */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...submitBtn,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating task…" : "Create Task"}
        </button>
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
  width: 560,
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

const section = {
  marginTop: 20,
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

const deadlineGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginTop: 20,
};

const hint = {
  fontSize: 12,
  color: "var(--color-text-muted)",
};

const submitBtn = {
  marginTop: 28,
  width: "100%",
  padding: "12px",
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  transition: "var(--transition-fast)",
};

const errorBox = {
  background: "#FEE2E2",
  color: "#991B1B",
  padding: "10px 12px",
  borderRadius: 8,
  marginTop: 16,
};
