import dotenv from "dotenv";
dotenv.config();

import express from "express";
import helmet from "helmet";
import cors from "cors";

import getCorsOptions from "./config/cors.js";
import correlationMiddleware from "./middlewares/requestId.middleware.js";
import { authRateLimiter, apiRateLimiter } from "./middlewares/rateLimit.middleware.js";

import healthRoutes from "./routes/health.routes.js";
import metricsRoutes from "./routes/metrics.routes.js";
import taskRoutes from "./routes/task.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import userRoutes from "./routes/user.routes.js";
import aiRoutes from "./routes/ai.routes.js";

import errorMiddleware from "./middlewares/error.middleware.js";

const app = express();

/* ---------------- SECURITY HEADERS ---------------- */
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows cross-origin SPA assets without breakages
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ---------------- HARDENED CORS ---------------- */
app.use(cors(getCorsOptions()));

/* ---------------- BODY PARSER ---------------- */
app.use(express.json({ limit: "1mb" }));

/* ---------------- REQUEST CORRELATION & LOGGING ---------------- */
app.use(correlationMiddleware);

/* ---------------- HEALTH & METRICS (NO RATE LIMIT) ---------------- */
app.use("/", healthRoutes);
app.use("/metrics", metricsRoutes);

/* ---------------- RATE-LIMITED API ROUTES ---------------- */
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/tasks", apiRateLimiter, taskRoutes);
app.use("/api/admin", apiRateLimiter, adminRoutes);
app.use("/api/admin/dashboard", apiRateLimiter, dashboardRoutes);
app.use("/api/users", apiRateLimiter, userRoutes);
app.use("/api/ai", aiRoutes);

/* ---------------- 404 HANDLER ---------------- */
app.use((req, res) => {
  const requestId = req.id || req.requestId;
  res.status(404).json({
    success: false,
    message: "Route not found",
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
      ...(requestId ? { requestId } : {}),
    },
    ...(requestId ? { requestId } : {}),
  });
});

/* ---------------- GLOBAL ERROR HANDLER ---------------- */
app.use(errorMiddleware);

export default app;
