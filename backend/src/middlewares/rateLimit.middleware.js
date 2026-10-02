import rateLimit from "express-rate-limit";

/**
 * Standard 429 response handler conforming to Sentinel API error format.
 */
const rateLimitHandler = (req, res) => {
  const requestId = req.id || req.requestId;
  res.status(429).json({
    success: false,
    message: "Too many requests, please try again later",
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
      ...(requestId ? { requestId } : {}),
    },
    ...(requestId ? { requestId } : {}),
  });
};

const isTestEnv = process.env.NODE_ENV === "test";

/**
 * Strict Rate Limiter for Authentication endpoints (/api/auth/login, /api/auth/register).
 * Protects against brute-force attacks and credential stuffing.
 * Default: 20 requests per 15-minute window.
 */
export const authRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 mins
  max: isTestEnv ? 50000 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || "20", 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => isTestEnv && req.headers["x-test-bypass-ratelimit"] === "true",
});

/**
 * General API Rate Limiter for general business endpoints.
 * Protects API availability from abusive traffic.
 * Default: 200 requests per 15-minute window.
 */
export const apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 mins
  max: isTestEnv ? 50000 : parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => isTestEnv && req.headers["x-test-bypass-ratelimit"] === "true",
});

/**
 * AI Assistant Rate Limiter (Phase 7).
 * AI operations invoke LLM inferencing and multi-step tool calls which are computationally
 * more intensive than standard REST queries.
 * Tenant and user aware: tracks by user ID (or fallback IP).
 * Default: 30 requests per 15-minute window.
 */
export const aiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 mins
  max: isTestEnv ? 50000 : parseInt(process.env.AI_RATE_LIMIT_MAX || "30", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  validate: { keyGeneratorIpFallback: false },
  handler: rateLimitHandler,
  skip: (req) => isTestEnv && req.headers["x-test-bypass-ratelimit"] === "true",
});

/**
 * Factory for creating custom-scoped rate limiters (e.g. for testing or sensitive operations)
 */
export const createCustomLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 60000,
    max: options.max || 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...options,
  });
};

export default {
  authRateLimiter,
  apiRateLimiter,
  createCustomLimiter,
};
