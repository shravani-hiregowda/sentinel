import React, { useEffect, useState } from "react";
import {
  fetchMyTasks,
  ackTaskApi,
  startTaskApi,
  completeTaskApi,
  fetchTaskTimeline,
} from "../api/adminApi";

import TaskDetailModal from "../components/TaskDetailModal";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";

/* ---------------- SLA UTILS ---------------- */
const getSLA = (task) => {
  const deadline =
    task.state === "OPEN" ? task.ackDeadline : task.actionDeadline;
  if (!deadline) return null;
  return new Date(deadline) - new Date();
};

const formatSLA = (ms) => {
  if (ms === null) return "—";
  if (ms <= 0) return "BREACHED";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const slaColor = (ms) => {
  if (ms === null) return "#9CA3AF";
  if (ms <= 0) return "#DC2626";
  if (ms < 3600000) return "#F59E0B";
  return "#16A34A";
};

/* ---------------- TASK CARD ---------------- */
function TaskCard({ task, openDetails, onAction }) {
  const sla = getSLA(task);
  const color = slaColor(sla);

  return (
    <div
      onClick={() => openDetails(task._id)}
      style={{
        background: "#FFFFFF",
        padding: 14,
        borderRadius: 12,
        marginBottom: 12,
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {task.title}
      </div>

      <div
        style={{
          fontSize: 12,
          marginTop: 4,
          color,
          fontWeight: 600,
        }}
      >
        SLA: {formatSLA(sla)}
      </div>

      <div style={{ marginTop: 10 }}>
        {task.state === "OPEN" && (
          <button onClick={(e) => onAction("ACK", task._id, e)}>
            ACKNOWLEDGE
          </button>
        )}

        {task.state === "ACKNOWLEDGED" && (
          <button onClick={(e) => onAction("START", task._id, e)}>
            START
          </button>
        )}

        {task.state === "IN_PROGRESS" && (
          <button onClick={(e) => onAction("COMPLETE", task._id, e)}>
            COMPLETE
          </button>
        )}

        {task.state === "CLOSED" && (
          <span style={{ color: "#16A34A", fontWeight: 600 }}>
            ✓ Completed
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- MAIN DASHBOARD ---------------- */
export default function MemberDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [timelineData, setTimelineData] = useState(null);

  const loadTasks = async () => {
    setLoading(true);
    const data = await fetchMyTasks();
    setTasks(data?.tasks || []);
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  /* ---------------- SOCKET LISTENERS ---------------- */
  const { socket } = useSocket() || {};

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => loadTasks();
    socket.on("task_created", handleUpdate);
    socket.on("task_updated", handleUpdate);
    socket.on("task_escalated", handleUpdate);
    return () => {
      socket.off("task_created", handleUpdate);
      socket.off("task_updated", handleUpdate);
      socket.off("task_escalated", handleUpdate);
    };
  }, [socket]);

  const openDetails = async (id) => {
    const data = await fetchTaskTimeline(id);
    setTimelineData(data);
    setModalOpen(true);
  };

  const handleAction = async (type, id, e) => {
    e.stopPropagation();
    if (type === "ACK") await ackTaskApi(id);
    if (type === "START") await startTaskApi(id);
    if (type === "COMPLETE") await completeTaskApi(id);
    loadTasks();
  };

  const columns = {
    OPEN: [],
    ACKNOWLEDGED: [],
    IN_PROGRESS: [],
    CLOSED: [],
  };

  tasks.forEach((t) => columns[t.state]?.push(t));

  if (loading) {
    return <h3 style={{ padding: 24 }}>Loading your workboard…</h3>;
  }

  return (
    <div style={{ padding: 24, background: "#F3F4F6", minHeight: "100vh" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          My Workboard
        </h1>

        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          style={{
            background: "#DC2626",
            color: "#fff",
            border: "none",
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* KANBAN */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {Object.entries(columns).map(([state, items]) => (
          <div key={state}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#374151",
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {state.replace("_", " ")}
            </h3>

            {items.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>
                No tasks
              </p>
            )}

            {items.map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                openDetails={openDetails}
                onAction={handleAction}
              />
            ))}
          </div>
        ))}
      </div>

      <TaskDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        data={timelineData}
        members={[]}
        onTaskUpdated={loadTasks}
      />
    </div>
  );
}
