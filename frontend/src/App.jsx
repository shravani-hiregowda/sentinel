import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTasksPage from "./pages/AdminTasksPage";
import AdminMembersPage from "./pages/AdminMembersPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import MemberDashboard from "./pages/MemberDashboard";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import CreateOrg from "./pages/CreateOrg";

import ProtectedRoute from "./routes/ProtectedRoute";

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* ───────────── PUBLIC ───────────── */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<CreateOrg />} />

      <Route
        path="/force-password-change"
        element={
          user ? <ForcePasswordChange /> : <Navigate to="/login" />
        }
      />

      {/* ───────────── ADMIN ───────────── */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/tasks"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminTasksPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/members"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminMembersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminReportsPage />
          </ProtectedRoute>
        }
      />

      {/* ───────────── MEMBER ───────────── */}
      <Route
        path="/member/tasks"
        element={
          <ProtectedRoute role="MEMBER">
            <MemberDashboard />
          </ProtectedRoute>
        }
      />

      {/* ───────────── ROOT REDIRECT ───────────── */}
      <Route
        path="/"
        element={
          user ? (
            user.role === "ADMIN" ? (
              <Navigate to="/admin/dashboard" />
            ) : (
              <Navigate to="/member/tasks" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />

      {/* ───────────── FALLBACK ───────────── */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
