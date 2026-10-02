import IORedis from "ioredis";

let redisClient = null;

/**
 * Returns configuration options for Redis / BullMQ connections.
 * BullMQ requires maxRetriesPerRequest: null.
 */
export const getRedisConfig = () => {
  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  const config = {
    host,
    port,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
  };

  if (password) {
    config.password = password;
  }

  return config;
};

/**
 * Creates and verifies a centralized Redis client connection.
 * Fails clearly if Redis is required but unreachable.
 */
export const connectRedis = async () => {
  if (redisClient && redisClient.status === "ready") {
    return redisClient;
  }

  const config = getRedisConfig();

  try {
    redisClient = new IORedis(config);

    redisClient.on("connect", () => {
      console.log(`✅ Redis connected to ${config.host}:${config.port}`);
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis connection error:", err.message);
    });

    // Verify connectivity with PING
    await redisClient.ping();
    return redisClient;
  } catch (error) {
    console.error("❌ Redis initialization failed:", error.message);
    throw new Error(`Failed to connect to Redis at ${config.host}:${config.port}: ${error.message}`);
  }
};

/**
 * Retrieves the active Redis client.
 * Throws an error if Redis is not yet connected.
 */
export const getRedisConnection = () => {
  if (!redisClient) {
    throw new Error("Redis client is not connected. Call connectRedis() first.");
  }
  return redisClient;
};

/**
 * Gracefully closes the Redis connection (used during worker/server shutdown and tests).
 */
export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

export default {
  getRedisConfig,
  connectRedis,
  getRedisConnection,
  closeRedis,
};
