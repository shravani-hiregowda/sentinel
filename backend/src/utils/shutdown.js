import mongoose from "mongoose";
import logger from "./logger.js";
import { closeRedis } from "../config/redis.js";
import { closeEscalationQueue } from "../queues/escalation.queue.js";

/**
 * Executes a controlled resource teardown across all active components.
 *
 * @param {Object} resources
 * @param {import("http").Server} [resources.server]
 * @param {import("socket.io").Server} [resources.io]
 * @param {import("bullmq").Worker} [resources.worker]
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=10000]
 * @param {boolean} [options.exitProcess=true]
 * @returns {Promise<void>}
 */
export const executeTeardown = async (resources = {}, options = {}) => {
  const timeoutMs = options.timeoutMs || parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "10000", 10);
  const exitProcess = options.exitProcess !== undefined ? options.exitProcess : true;

  logger.info("🛑 Commencing graceful shutdown sequence...", { timeoutMs });

  let timer;
  if (exitProcess) {
    timer = setTimeout(() => {
      logger.error("⚠️ Graceful shutdown timed out. Forcing process exit.");
      process.exit(1);
    }, timeoutMs);
    timer.unref(); // Do not keep event loop alive solely for timeout
  }

  try {
    // 1. Stop HTTP Server (no new incoming connections)
    if (resources.server && resources.server.close) {
      await new Promise((resolve) => {
        resources.server.close((err) => {
          if (err) logger.warn("HTTP server close warning:", { error: err.message });
          else logger.info("✅ HTTP server stopped accepting connections.");
          resolve();
        });
      });
    }

    // 2. Close Socket.io server
    if (resources.io && resources.io.close) {
      try {
        await resources.io.close();
        logger.info("✅ Socket.io server closed.");
      } catch (err) {
        logger.warn("Socket.io close warning:", { error: err.message });
      }
    }

    // 3. Stop BullMQ worker (allows active job to finish)
    if (resources.worker && resources.worker.close) {
      try {
        await resources.worker.close();
        logger.info("✅ BullMQ worker closed cleanly.");
      } catch (err) {
        logger.warn("BullMQ worker close warning:", { error: err.message });
      }
    }

    // 4. Close BullMQ queue connections
    try {
      await closeEscalationQueue();
      logger.info("✅ BullMQ queue connections closed.");
    } catch (err) {
      logger.warn("Queue close warning:", { error: err.message });
    }

    // 5. Close Redis connection
    try {
      await closeRedis();
      logger.info("✅ Redis connection closed.");
    } catch (err) {
      logger.warn("Redis close warning:", { error: err.message });
    }

    // 6. Close MongoDB connection
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close(false);
        logger.info("✅ MongoDB connection closed.");
      } catch (err) {
        logger.warn("MongoDB close warning:", { error: err.message });
      }
    }

    if (timer) clearTimeout(timer);
    logger.info("✅ All resources shut down cleanly.");

    if (exitProcess) {
      process.exit(0);
    }
  } catch (error) {
    logger.error("❌ Error during graceful shutdown:", { error: error.message });
    if (timer) clearTimeout(timer);
    if (exitProcess) {
      process.exit(1);
    }
    throw error;
  }
};

/**
 * Attaches signal handlers for API server process.
 */
export const setupApiGracefulShutdown = (server, io, options = {}) => {
  let isShuttingDown = false;

  const handleSignal = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating API graceful shutdown...`);
    await executeTeardown({ server, io }, options);
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  return { handleSignal };
};

/**
 * Attaches signal handlers for standalone worker process.
 */
export const setupWorkerGracefulShutdown = (worker, options = {}) => {
  let isShuttingDown = false;

  const handleSignal = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating Worker graceful shutdown...`);
    await executeTeardown({ worker }, options);
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  return { handleSignal };
};

export default {
  executeTeardown,
  setupApiGracefulShutdown,
  setupWorkerGracefulShutdown,
};
