import { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AppLayout from "../components/AppLayout";
import TasksTable from "../components/TasksTable";
import { fetchAdminTasks, updateTaskStateAdminApi } from "../api/adminApi";
import { useSocket } from "../context/SocketContext";

/* ---------------- CONSTANTS ---------------- */

const STATES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED", "CLOSED"];

const stateColor = {
  OPEN: "var(--color-primary)",
  ACKNOWLEDGED: "var(--color-warning)",
  IN_PROGRESS: "#0EA5E9",
  ESCALATED: "var(--color-danger)",
  CLOSED: "var(--color-success)",
};

/* ---------------- TASK CARD ---------------- */

function TaskCard({ task, provided, isDragging }) {
  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        background: "var(--color-bg-card)",
        color: "var(--color-text-main)",
        padding: 12,
        borderRadius: 10,
        marginBottom: 12,
        borderLeft: `4px solid ${stateColor[task.state]}`,
        boxShadow: isDragging ? "var(--shadow-lg)" : "var(--shadow-sm)",
        cursor: "grab",
        opacity: isDragging ? 0.9 : 1,
        ...provided.draggableProps.style,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {task.title}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
        Owner: {task.owner?.name || "—"}
      </div>

      <span
        style={{
          display: "inline-block",
          marginTop: 8,
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 999,
          background: `${stateColor[task.state]}20`,
          color: stateColor[task.state],
        }}
      >
        {task.state}
      </span>
    </div>
  );
}

/* ---------------- BOARD VIEW ---------------- */

function TasksBoard({ tasks, onTaskStateChange }) {
  // Local state for optimistic drag and drop updates
  const [boardData, setBoardData] = useState({});

  useEffect(() => {
    const grouped = {};
    STATES.forEach((s) => (grouped[s] = []));
    tasks.forEach((t) => {
      if (grouped[t.state]) grouped[t.state].push(t);
    });
    setBoardData(grouped);
  }, [tasks]);

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    // Optimistic UI Update
    const sourceCol = boardData[source.droppableId];
    const destCol = boardData[destination.droppableId];
    const taskIndex = sourceCol.findIndex(t => t._id === draggableId);
    const task = sourceCol[taskIndex];

    const newSourceCol = [...sourceCol];
    newSourceCol.splice(source.index, 1);

    const newDestCol = [...destCol];
    const updatedTask = { ...task, state: destination.droppableId };
    newDestCol.splice(destination.index, 0, updatedTask);

    setBoardData({
      ...boardData,
      [source.droppableId]: newSourceCol,
      [destination.droppableId]: newDestCol,
    });

    // API Call
    onTaskStateChange(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 16,
            paddingBottom: 16,
            minWidth: STATES.length * 320,
          }}
        >
          {STATES.map((state) => (
            <Droppable droppableId={state} key={state}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    width: 300,
                    flexShrink: 0,
                    background: snapshot.isDraggingOver ? "var(--color-bg-card)" : "var(--color-bg-body)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 14,
                    padding: 12,
                    maxHeight: "100%",
                    overflowY: "auto",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <h4
                    style={{
                      marginBottom: 12,
                      fontSize: 13,
                      fontWeight: 700,
                      color: stateColor[state],
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {state.replace("_", " ")} ({boardData[state]?.length || 0})
                  </h4>

                  {boardData[state]?.map((task, index) => (
                    <Draggable key={task._id} draggableId={task._id} index={index}>
                      {(provided, snapshot) => (
                        <TaskCard
                          task={task}
                          provided={provided}
                          isDragging={snapshot.isDragging}
                        />
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </div>
    </DragDropContext>
  );
}

/* ---------------- MAIN PAGE ---------------- */

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("board");

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchAdminTasks({ limit: 100 }); // Default fetch for board
      setTasks(res?.tasks || []);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

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
  }, [socket, loadTasks]);

  const handleTaskStateChange = async (taskId, newState) => {
    try {
      await updateTaskStateAdminApi(taskId, newState);
    } catch (error) {
      console.error("Failed to update task state", error);
      loadTasks(); // Revert on failure
    }
  };

  return (
    <AppLayout title="Tasks">
      {/* VIEW TOGGLE */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {["board", "table"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: view === v ? "var(--color-primary)" : "var(--color-bg-card)",
                color: view === v ? "#fff" : "var(--color-text-main)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "var(--transition-fast)",
              }}
            >
              {v === "board" ? "Board" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Loading tasks...</p>
      ) : view === "board" ? (
        <TasksBoard tasks={tasks} onTaskStateChange={handleTaskStateChange} />
      ) : (
        <TasksTable tasks={tasks} onRefresh={loadTasks} />
      )}
    </AppLayout>
  );
}
