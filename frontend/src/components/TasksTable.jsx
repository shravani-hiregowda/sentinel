import { useState, useEffect, useCallback } from "react";
import { fetchAdminTasks, fetchMembers, reassignTask } from "../api/adminApi";
import { useSocket } from "../context/SocketContext";

const statusColor = {
  OPEN: "var(--color-primary)",
  ACKNOWLEDGED: "var(--color-warning)",
  IN_PROGRESS: "#0EA5E9",
  ESCALATED: "var(--color-danger)",
  CLOSED: "var(--color-success)",
};

export default function TasksTable() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [selected, setSelected] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminTasks({
        q: search,
        page,
        limit,
        startDate,
        endDate,
      });
      setTasks(res.tasks || []);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      console.error("Failed to load table tasks", err);
    } finally {
      setLoading(false);
    }
  }, [search, page, limit, startDate, endDate]);

  useEffect(() => {
    loadData();
    fetchMembers()
      .then((res) => setMembers(res.report || []))
      .catch(console.error);
  }, [loadData]);

  // Real-time updates for table view
  const { socket } = useSocket() || {};
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => loadData();
    socket.on("task_created", handleUpdate);
    socket.on("task_updated", handleUpdate);
    socket.on("task_escalated", handleUpdate);
    return () => {
      socket.off("task_created", handleUpdate);
      socket.off("task_updated", handleUpdate);
      socket.off("task_escalated", handleUpdate);
    };
  }, [socket, loadData]);

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selected.length === tasks.length) {
      setSelected([]);
    } else {
      setSelected(tasks.map((t) => t._id));
    }
  };

  const handleBulkReassign = async () => {
    if (!selectedMember) {
      alert("Please select a member to reassign to.");
      return;
    }
    setIsReassigning(true);
    try {
      await Promise.all(
        selected.map((taskId) => reassignTask(taskId, selectedMember))
      );
      setSelected([]);
      setSelectedMember("");
      loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to reassign some tasks");
    } finally {
      setIsReassigning(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* TOOLBAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              padding: "8px 12px",
              width: 240,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-card)",
              color: "var(--color-text-main)",
              outline: "none",
              fontSize: "14px",
            }}
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-card)",
              color: "var(--color-text-main)",
              outline: "none",
            }}
          />
          <span style={{ color: "var(--color-text-muted)" }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-card)",
              color: "var(--color-text-main)",
              outline: "none",
            }}
          />
        </div>

        {selected.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-card)",
                color: "var(--color-text-main)",
                outline: "none",
              }}
            >
              <option value="">Select Member...</option>
              {members.map((m) => {
                const member = m.member || m;
                return (
                  <option key={member._id || member.id} value={member._id || member.id}>
                    {member.name}
                  </option>
                );
              })}
            </select>
            <button
              onClick={handleBulkReassign}
              disabled={isReassigning}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-main)",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: isReassigning ? "not-allowed" : "pointer",
                opacity: isReassigning ? 0.7 : 1,
              }}
            >
              {isReassigning ? "Reassigning..." : "Bulk Reassign"}
            </button>
          </div>
        )}
      </div>

      {/* TABLE */}
      <div style={{ 
        overflowX: "auto", 
        background: "var(--color-bg-card)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--color-border)",
      }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr style={{ background: "var(--color-bg-body)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "12px", width: "40px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={selected.length === tasks.length && tasks.length > 0}
                  onChange={selectAll}
                  style={{ cursor: "pointer" }}
                />
              </th>
              <Th label="TITLE" />
              <Th label="OWNER" />
              <Th label="STATE" />
              <Th label="CREATED" />
            </tr>
          </thead>

          <tbody>
            {loading ? (
               <tr><td colSpan="5" style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>Loading data...</td></tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                  No tasks found.
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr
                  key={t._id}
                  style={{ borderBottom: "1px solid var(--color-border)", transition: "var(--transition-fast)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-body)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(t._id)}
                      onChange={() => toggleSelect(t._id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "12px", fontWeight: 500, color: "var(--color-text-main)" }}>{t.title}</td>
                  <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{t.owner?.name || "—"}</td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: `${statusColor[t.state]}15`,
                        color: statusColor[t.state],
                        border: `1px solid ${statusColor[t.state]}30`
                      }}
                    >
                      {t.state}
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-muted)", fontSize: "13px" }}>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* PAGINATION */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-bg-body)"
        }}>
          <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
            Showing {tasks.length} of {totalCount} results
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button 
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-main)",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: page === 1 ? "not-allowed" : "pointer",
                opacity: page === 1 ? 0.5 : 1
              }}>
              Previous
            </button>
            <span style={{ fontSize: "13px", color: "var(--color-text-main)", fontWeight: 500 }}>
              Page {page} of {totalPages}
            </span>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-main)",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.5 : 1
              }}>
              Next
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function Th({ label }) {
  return (
    <th
      style={{
        padding: "12px",
        textAlign: "left",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--color-text-muted)",
        letterSpacing: "0.5px",
        userSelect: "none"
      }}
    >
      {label}
    </th>
  );
}
