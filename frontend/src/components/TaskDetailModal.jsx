import React from "react";

export default function TaskDetailModal({
  open,
  onClose,
  data,
  members = [],
  onTaskUpdated,
}) {
  if (!open || !data?.task) return null;

  const task = data?.task || {};

    const timeline =
      data?.timeline ||
      data?.transitions ||
      data?.data?.timeline ||
      [];


  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  const StatusPill = ({ state }) => {
    const colorMap = {
      OPEN: "#2563EB",
      ACKNOWLEDGED: "#F59E0B",
      IN_PROGRESS: "#0EA5E9",
      ESCALATED: "#DC2626",
      CLOSED: "#16A34A",
    };

    return (
      <span
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          background: colorMap[state] + "20",
          color: colorMap[state],
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        {state}
      </span>
    );
  };

  return (
    <div style={overlay} className="animate-fade-in">
      <div style={modal} className="animate-slide-up">
        {/* HEADER */}
        <div style={header}>
          <div>
            <h2 style={{ margin: 0 }}>{task.title}</h2>
            <div style={{ marginTop: 8 }}>
              <StatusPill state={task.state} />
            </div>
          </div>

          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* META GRID */}
        <div style={metaGrid}>
          <Meta label="Owner: " value={task.owner?.name || "—"} />
          <Meta label="Created By: " value={task.createdBy?.name || "—"} />
          <Meta label="ACK Deadline: " value={formatDate(task.ackDeadline)} />
          <Meta label="Action Deadline: " value={formatDate(task.actionDeadline)} />
        </div>

        {/* ACTION */}
        <button style={auditBtn}>
          ⬇ Download Audit Report (CSV)
        </button>

        {/* TIMELINE */}
        <div style={{ marginTop: 28 }}>
          <h3 style={{ marginBottom: 12 }}>Transition Timeline</h3>

          {timeline.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>No transitions recorded</p>
          ) : (
            <div style={timelineWrap}>
              {timeline.map((t, i) => (
                <div key={i} style={timelineItem}>
                  <div style={dot}></div>

                  <div>
                    <strong>
                      {t.fromState} → {t.toState}
                    </strong>
                    <div style={timelineMeta}>
                      Trigger: {t.triggeredBy || "SYSTEM"} · Actor:{" "}
                      {t.actor?.name || "SYSTEM"}
                    </div>
                    <small style={{ color: "var(--color-text-muted)" }}>
                      {formatDate(t.createdAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- SMALL COMPONENTS ---------------- */

const Meta = ({ label, value }) => (
  <div style={metaCard}>
    <span style={metaLabel}>{label}</span>
    <strong>{value}</strong>
  </div>
);

/* ---------------- STYLES ---------------- */

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 999,
};

const modal = {
  background: "var(--color-bg-card)",
  color: "var(--color-text-main)",
  width: "760px",
  maxHeight: "85vh",
  overflowY: "auto",
  borderRadius: 16,
  padding: 24,
  fontFamily: "Inter, system-ui, sans-serif",
  boxShadow: "var(--shadow-xl)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const closeBtn = {
  border: "none",
  background: "transparent",
  fontSize: 20,
  cursor: "pointer",
  color: "var(--color-text-muted)",
};

const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 16,
  marginTop: 24,
};

const metaCard = {
  background: "var(--color-bg-body)",
  padding: 12,
  borderRadius: 10,
};

const metaLabel = {
  fontSize: 12,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: "4px",
};

const auditBtn = {
  marginTop: 20,
  width: "100%",
  padding: "12px",
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 600,
  transition: "var(--transition-fast)",
};

const timelineWrap = {
  borderLeft: "2px solid var(--color-border)",
  paddingLeft: 16,
};

const timelineItem = {
  display: "flex",
  gap: 12,
  marginBottom: 16,
};

const dot = {
  width: 10,
  height: 10,
  background: "var(--color-primary)",
  borderRadius: "50%",
  marginTop: 6,
};

const timelineMeta = {
  fontSize: 13,
  color: "var(--color-text-muted)",
};
