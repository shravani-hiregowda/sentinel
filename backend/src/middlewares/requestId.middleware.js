import crypto from "crypto";
import logger from "../utils/logger.js";
import { recordHttpRequest } from "../metrics/metrics.js";

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Request Correlation & Logging Middleware
 *
 * Guarantees:
 * 1. Safe extraction or generation of a unique correlation ID per incoming HTTP request.
 * 2. Attachment of `req.id` and `req.requestId` for downstream layers.
 * 3. Echoing of `X-Request-ID` in HTTP response headers.
 * 4. Contextual child logger attached to `req.logger`.
 * 5. Structured HTTP access logging with duration and status code.
 * 6. Prometheus HTTP metrics recording.
 */
export const correlationMiddleware = (req, res, next) => {
  const incomingId = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const requestId =
    typeof incomingId === "string" && VALID_REQUEST_ID_REGEX.test(incomingId.trim())
      ? incomingId.trim()
      : `req_${crypto.randomUUID()}`;

  req.id = requestId;
  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  // Attach request-scoped child logger
  req.logger = logger.child({
    requestId,
    service: "sentinel-api",
  });

  const startTime = process.hrtime.bigint();

  // Log and record metrics when response finishes
  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;
    const durationSec = durationMs / 1000;

    const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path || req.url;
    // Normalize route pattern for metrics to avoid high cardinality
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : (path.startsWith("/api") ? path.split("?")[0] : path);

    // Record Prometheus metrics
    try {
      recordHttpRequest(req.method, route, res.statusCode, durationSec);
    } catch {
      // Metric recording failure should never disrupt response
    }

    const logData = {
      event: "http.request",
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      ...(req.orgId ? { orgId: req.orgId.toString() } : {}),
      ...(req.user?._id ? { userId: req.user._id.toString() } : {}),
    };

    // Filter noisy health checks to debug level
    const isHealthCheck = req.path === "/health" || req.path === "/ready" || req.path === "/metrics";

    if (res.statusCode >= 500) {
      req.logger.error("HTTP Request Failed", logData);
    } else if (res.statusCode >= 400) {
      req.logger.warn("HTTP Client Error", logData);
    } else if (isHealthCheck) {
      req.logger.debug("HTTP Health Check", logData);
    } else {
      req.logger.info("HTTP Request Completed", logData);
    }
  });

  next();
};

export default correlationMiddleware;
