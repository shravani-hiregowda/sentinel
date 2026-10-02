import { Server } from "socket.io";
import { getCorsOptions } from "./cors.js";
import logger from "../utils/logger.js";

let io;

export const initSocket = (server) => {
  const corsOptions = getCorsOptions();

  io = new Server(server, {
    cors: {
      origin: corsOptions.origin,
      methods: corsOptions.methods,
      credentials: corsOptions.credentials,
    },
  });

  io.on("connection", (socket) => {
    logger.debug("Socket client connected", { socketId: socket.id });

    // Auto-join tenant room if specified in auth/query
    const orgId = socket.handshake.auth?.orgId || socket.handshake.query?.orgId;
    if (orgId) {
      socket.join(`org:${orgId}`);
      logger.debug(`Socket ${socket.id} joined tenant room org:${orgId}`);
    }

    socket.on("join_tenant", (tenantId) => {
      if (tenantId) {
        socket.join(`org:${tenantId}`);
        logger.debug(`Socket ${socket.id} joined tenant room org:${tenantId}`);
      }
    });

    socket.on("leave_tenant", (tenantId) => {
      if (tenantId) {
        socket.leave(`org:${tenantId}`);
      }
    });

    socket.on("disconnect", () => {
      logger.debug("Socket client disconnected", { socketId: socket.id });
    });
  });

  return io;
};

export const getIo = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export default {
  initSocket,
  getIo,
};
