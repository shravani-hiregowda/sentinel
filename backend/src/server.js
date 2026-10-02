import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./config/socket.js";
import logger from "./utils/logger.js";
import { setupApiGracefulShutdown } from "./utils/shutdown.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Verify Redis connectivity for distributed queuing
    await connectRedis();

    // 3. Create HTTP server and attach Socket.io
    const server = http.createServer(app);
    const io = initSocket(server);

    // 4. Attach graceful shutdown handlers (SIGINT, SIGTERM)
    setupApiGracefulShutdown(server, io);

    // 5. Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 Sentinel API Server running on port ${PORT}`, {
        service: "sentinel-api",
        port: PORT,
        environment: process.env.NODE_ENV || "development",
      });
      logger.info(
        "ℹ️ SLA escalation processing is delegated to independent BullMQ worker(s)",
        { service: "sentinel-api" }
      );
    });

    return server;
  } catch (error) {
    logger.error("❌ Failed to start server:", {
      service: "sentinel-api",
      error: { message: error.message, stack: error.stack },
    });
    process.exit(1); // Fail fast
  }
}

// Auto-run if executed directly as script
if (process.argv[1]?.endsWith("server.js")) {
  startServer();
}

export default startServer;
