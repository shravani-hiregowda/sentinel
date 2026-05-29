import IORedis from "ioredis";

let redisConnection = null;

export const connectRedis = async () => {
  try {
    if (redisConnection) {
      return redisConnection; // prevent duplicate connections
    }

    redisConnection = new IORedis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      maxRetriesPerRequest: null, // required for BullMQ
      enableReadyCheck: false,    // required for BullMQ
    });

    redisConnection.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redisConnection.on("error", (err) => {
      console.error("❌ Redis connection error", err);
    });

    return redisConnection;
  } catch (error) {
    console.error("❌ Redis initialization failed");
    throw error;
  }
};

export const getRedisConnection = () => {
  if (!redisConnection) {
    throw new Error("Redis not connected yet");
  }
  return redisConnection;
};
