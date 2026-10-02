import mongoose from "mongoose";
import { connectRedis, getRedisConnection } from "../config/redis.js";

/**
 * Health check handler (Process Liveness)
 * Indicates that the Node.js process is running and accepting connections.
 */
export const getHealth = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "sentinel-api",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
};

/**
 * Readiness check handler (Dependency Verification)
 * Validates connectivity to MongoDB and Redis without executing expensive operations.
 * Reuses centralized connection pools without creating redundant sockets.
 */
export const getReadiness = async (req, res) => {
  const checks = {
    mongodb: { status: "unknown" },
    redis: { status: "unknown" },
  };

  let allReady = true;

  // 1. Check MongoDB connectivity
  try {
    const mongoReady = mongoose.connection.readyState === 1;
    if (mongoReady) {
      checks.mongodb = { status: "up" };
    } else {
      checks.mongodb = {
        status: "down",
        readyState: mongoose.connection.readyState,
        error: "MongoDB connection not open",
      };
      allReady = false;
    }
  } catch (err) {
    checks.mongodb = { status: "down", error: err.message };
    allReady = false;
  }

  // 2. Check centralized Redis connectivity
  try {
    let client;
    try {
      client = getRedisConnection();
    } catch {
      client = await connectRedis();
    }

    if (client && (client.status === "ready" || client.status === "connect")) {
      const pingRes = await client.ping();
      if (pingRes === "PONG") {
        checks.redis = { status: "up" };
      } else {
        checks.redis = { status: "down", error: `Unexpected ping response: ${pingRes}` };
        allReady = false;
      }
    } else {
      checks.redis = {
        status: "down",
        error: `Redis client is not ready (status: ${client?.status || "disconnected"})`,
      };
      allReady = false;
    }
  } catch (err) {
    checks.redis = { status: "down", error: err.message };
    allReady = false;
  }

  const statusCode = allReady ? 200 : 503;
  const status = allReady ? "ready" : "not_ready";

  return res.status(statusCode).json({
    status,
    service: "sentinel-api",
    checks,
    timestamp: new Date().toISOString(),
  });
};

export default {
  getHealth,
  getReadiness,
};
