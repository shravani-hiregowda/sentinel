import React, { useEffect, useState, useCallback } from "react";
import {
  fetchSummary,
  fetchMembers,
  fetchTaskTimeline,
  fetchAdminTasks,
  fetchActivityFeed,
} from "../api/adminApi";

import TaskDetailModal from "../components/TaskDetailModal";
import CreateTaskModal from "../components/CreateTaskModal";
import CreateMemberModal from "../components/CreateMemberModal";
import ChangePasswordModal from "../components/ChangePasswordModal";
import AppLayout from "../components/AppLayout";
import { useSocket } from "../context/SocketContext";

import Card from "../ui/Card";
import Button from "../ui/Button";

export default function AdminDashboard() {
  const [summary, setSummary] = useState({});
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [timelineData, setTimelineData] = useState(null);

  /* ---------------- SAFE ARRAYS ---------------- */
  const safeMembers = Array.isArray(members) ? members : [];
  const safeActivity = Array.isArray(activity) ? activity : [];
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  /* ---------------- HELPERS ---------------- */
  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  /* ---------------- LOAD DASHBOARD ---------------- */
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);

      const summaryData = await fetchSummary();
      const memberData = await fetchMembers();
      const activityData = await fetchActivityFeed(15);
      const tasksData = await fetchAdminTasks({});

      setSummary(summaryData?.summary || {});
      setMembers(memberData?.report || []);

      // ✅ ENTERPRISE DEFENSIVE FIX (CRITICAL)
      setActivity(
        Array.isArray(activityData?.feed)
          ? activityData.feed
          : []
      );

      setTasks(tasksData?.tasks || []);
    } catch (err) {
      console.error("❌ Dashboard load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /* ---------------- SOCKET LISTENERS ---------------- */
  const { socket } = useSocket() || {};

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      loadDashboard();
    };

    socket.on("task_created", handleUpdate);
    socket.on("task_updated", handleUpdate);
    socket.on("task_escalated", handleUpdate);

    return () => {
      socket.off("task_created", handleUpdate);
      socket.off("task_updated", handleUpdate);
      socket.off("task_escalated", handleUpdate);
    };
  }, [socket, loadDashboard]);

  /* ---------------- TASK DETAIL ---------------- */
  const openTaskDetails = async (taskId) => {
    if (!taskId) return;
    try {
      const data = await fetchTaskTimeline(taskId);
      setTimelineData(data);
      setModalOpen(true);
    } catch (err) {
      console.error("❌ Timeline fetch failed:", err);
    }
  };

  if (loading) {
    return <h3 style={{ padding: 24 }}>Loading Admin Dashboard…</h3>;
  }

  return (
    <AppLayout title="Admin Dashboard">

      {/* ACTION BAR */}
      <div
        className="animate-slide-up"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <Button onClick={() => setCreateOpen(true)}>
          + Create Task
        </Button>

        <Button variant="ghost" onClick={() => setMemberModalOpen(true)}>
          + Add Member
        </Button>

        <Button variant="ghost" onClick={() => setPasswordOpen(true)}>
          Change Password
        </Button>
      </div>

      {/* KPI GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          marginBottom: 36,
        }}
      >
        <div className="animate-slide-up delay-100"><Card title="Open" value={summary.open || 0} /></div>
        <div className="animate-slide-up delay-100"><Card title="Acknowledged" value={summary.acknowledged || 0} /></div>
        <div className="animate-slide-up delay-200"><Card title="In Progress" value={summary.inProgress || 0} /></div>
        <div className="animate-slide-up delay-200"><Card title="Escalated" value={summary.escalated || 0} tone="danger" /></div>
        <div className="animate-slide-up delay-300"><Card title="Closed" value={summary.closed || 0} tone="success" /></div>
      </div>

      {/* LIVE ACTIVITY */}
      <div className="animate-slide-up delay-300">
        <Card title="Live Activity">
          {safeActivity.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>
              No recent activity
            </p>
          ) : (
            safeActivity.map((a) => (
              <div
                key={a._id}
                onClick={() => openTaskDetails(a.task?._id)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: a.task?._id ? "pointer" : "default",
                  transition: "var(--transition-fast)",
                  borderRadius: "var(--radius-sm)",
                  margin: "4px -16px",
                }}
                onMouseEnter={(e) => a.task?._id && (e.currentTarget.style.background = "var(--color-bg-body)")}
                onMouseLeave={(e) => a.task?._id && (e.currentTarget.style.background = "transparent")}
              >
                <strong>{a.fromState}</strong> →{" "}
                <strong>{a.toState}</strong>

                <div style={{ marginTop: 6, fontWeight: 500, color: "var(--color-text-main)" }}>
                  {a.task?.title || "Unknown Task"}
                </div>

                <small style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                  {formatDate(a.createdAt)}
                </small>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* MODALS */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        members={safeMembers}
        onCreated={loadDashboard}
      />

      <CreateMemberModal
        open={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        onCreated={loadDashboard}
      />

      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />

      <TaskDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        data={timelineData}
        members={safeMembers}
        onTaskUpdated={loadDashboard}
      />

    </AppLayout>
  );
}
