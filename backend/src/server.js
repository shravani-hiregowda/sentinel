import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import connectDB from "./config/db.js";
import { startAckEscalationJob } from "./jobs/ackEscalation.job.js";
import { startActionEscalationJob } from "./jobs/actionEscalation.job.js";
import userRoutes from "./routes/user.routes.js";
import { connectRedis } from "./config/redis.js";



import http from "http";
import { initSocket } from "./config/socket.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDB();
    console.log("MongoDB connected");

    // 2. Connect to Redis (for BullMQ later)
    // await connectRedis();
    // console.log("Redis connected");

    // 3. Create HTTP server and attach Socket.io
    const server = http.createServer(app);
    initSocket(server);

    // 4. Start HTTP server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      //Start background scheduler
      startAckEscalationJob();
      startActionEscalationJob();
    });

  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1); // Fail fast (important)
  }
}

startServer();
