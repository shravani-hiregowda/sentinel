import { useEffect, useState } from "react";
import { fetchTasksByOwner } from "../api/adminApi";
import { useAuth } from "../context/AuthContext";

export default function MemberTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!user) return;

    fetchTasksByOwner(user.id).then((data) => {
      setTasks(data.tasks || []);
    });
  }, [user]);

  return (
    <div style={{ padding: 20 }}>
      <h2>My Tasks</h2>

      {tasks.length === 0 ? (
        <p>No tasks assigned</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t._id}>
              <b>{t.title}</b> — {t.state}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
