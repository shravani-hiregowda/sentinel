import dotenv from "dotenv";
dotenv.config();

/**
 * Validates and exposes centralized application environment configuration.
 */
const env = {
  // Server
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",

  // Database
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/sentinel",

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,

  // JWT / Auth
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? undefined : "super_strong_secret_key"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Twilio (Optional)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,

  // CORS
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || "",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 mins
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "20", 10),

  // Logging & Shutdown
  LOG_LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info"),
  SHUTDOWN_TIMEOUT_MS: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "10000", 10),
};

if (env.isProduction && !env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required in production mode.");
}

export default env;
