import axios from "axios";

// ✅ Central axios instance
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL,
});

// ✅ Attach JWT token automatically to every request (except login)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Optional: handle expired token errors globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn("⚠️ Unauthorized! Token missing/expired.");
    }
    return Promise.reject(error);
  }
);

// -----------------------
// ✅ ADMIN DASHBOARD APIS
// -----------------------

export const fetchSummary = async () => {
  const res = await api.get("/api/admin/dashboard/summary");
  return res.data;
};

export const fetchEscalated = async () => {
  const res = await api.get("/api/admin/dashboard/escalated");
  return res.data;
};

export const fetchOverdue = async () => {
  const res = await api.get("/api/admin/dashboard/overdue");
  return res.data;
};

export const fetchMembers = async () => {
  const res = await api.get("/api/admin/dashboard/members");
  return res.data;
};

export const fetchActivityFeed = async (limit = 20) => {
  const res = await api.get(`/api/admin/dashboard/activity?limit=${limit}`);
  return res.data;
};

export const fetchAdminTasks = async ({ q, state, ownerId, overdue, page, limit, startDate, endDate }) => {
  const params = new URLSearchParams();

  if (q) params.append("q", q);
  if (state) params.append("state", state);
  if (ownerId) params.append("ownerId", ownerId);
  if (overdue) params.append("overdue", "true");
  if (page) params.append("page", page);
  if (limit) params.append("limit", limit);
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  const res = await api.get(`/api/admin/tasks?${params.toString()}`);
  return res.data;
};

export const updateTaskStateAdminApi = async (taskId, state) => {
  const res = await api.put(`/api/admin/tasks/${taskId}/state`, { state });
  return res.data;
};

// -----------------------
// ✅ TASK APIS (Protected)
// -----------------------

export const fetchTaskTimeline = async (taskId) => {
  const res = await api.get(`/api/tasks/${taskId}/timeline`);
  return res.data;
};

export const createTaskApi = async (taskData) => {
  const res = await api.post("/api/tasks", taskData);
  return res.data;
};

export const ackTaskApi = async (taskId) => {
  const res = await api.post(`/api/tasks/${taskId}/ack`);
  return res.data;
};

export const startTaskApi = async (taskId) => {
  const res = await api.post(`/api/tasks/${taskId}/start`);
  return res.data;
};

export const completeTaskApi = async (taskId) => {
  const res = await api.post(`/api/tasks/${taskId}/complete`);
  return res.data;
};

export const fetchTasksByOwner = async (ownerId) => {
  const res = await api.get(`/api/tasks/owner/${ownerId}`);
  return res.data;
};

// -----------------------
// ✅ AUTH API (Public)
// -----------------------

export const loginApi = async (email, password) => {
  const res = await axios.post(`${baseURL}/api/auth/login`, {
    email,
    password,
  });
  return res.data;
};

export const registerOrg = async (payload) => {
  const res = await axios.post(`${baseURL}/api/auth/register`, payload);
  return res.data;
};

export const reassignTask = async (taskId, newOwnerId) => {
  const res = await api.post(`/api/admin/tasks/${taskId}/reassign`, {
    ownerId: newOwnerId,
  });
  return res.data;
};

export const fetchMyTasks = async () => {
  const res = await api.get("/api/tasks/my");
  return res.data;
};

export const createMemberApi = async (payload) => {
  const res = await api.post("/api/users/create-member", payload);
  return res.data;
};

export const changePasswordApi = async (payload) => {
  const res = await api.patch("/api/users/change-password", payload);
  return res.data;
};
