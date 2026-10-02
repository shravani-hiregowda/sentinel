import logger from "../utils/logger.js";

/**
 * Centralized Production Error Handling Middleware
 *
 * Guarantees:
 * 1. Standardized, safe error response shape across the entire API.
 * 2. Proper HTTP status code mapping (400, 401, 403, 404, 409, 429, 500).
 * 3. Never leaks stack traces, database internals, or JWT secrets in production.
 * 4. Logs full error context correlated with requestId and tenant context.
 * 5. Backward compatibility for clients inspecting either `message` or `error.message`.
 */
const errorMiddleware = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errorCode = err.code || "INTERNAL_SERVER_ERROR";

  // Handle Mongoose CastError (Bad ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID";
    errorCode = "INVALID_ID";
  }

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors || {})
      .map((val) => val.message)
      .join(", ");
    errorCode = "VALIDATION_ERROR";
  }

  // Handle MongoDB Duplicate Key (E11000)
  if (err.code === 11000) {
    statusCode = 400;
    message = "Duplicate field value entered";
    errorCode = "DUPLICATE_RESOURCE";
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Not authorized, token invalid";
    errorCode = "UNAUTHORIZED";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired, please log in again";
    errorCode = "TOKEN_EXPIRED";
  }

  // Map known status codes to semantic error codes
  if (statusCode === 401 && errorCode === "INTERNAL_SERVER_ERROR") {
    errorCode = "UNAUTHORIZED";
  } else if (statusCode === 403 && errorCode === "INTERNAL_SERVER_ERROR") {
    errorCode = "FORBIDDEN";
  } else if (statusCode === 404 && errorCode === "INTERNAL_SERVER_ERROR") {
    errorCode = "NOT_FOUND";
  } else if (statusCode === 409 && errorCode === "INTERNAL_SERVER_ERROR") {
    errorCode = "CONFLICT";
  } else if (statusCode === 429 && errorCode === "INTERNAL_SERVER_ERROR") {
    errorCode = "RATE_LIMIT_EXCEEDED";
  }

  const requestId = req?.id || req?.requestId;

  // Mask internal error messages in production for unexpected server errors
  const isProduction = process.env.NODE_ENV === "production";
  const clientMessage =
    isProduction && statusCode === 500 ? "An unexpected error occurred" : message;

  // Structured error logging
  const logContext = {
    event: "error.unhandled",
    requestId,
    statusCode,
    errorCode,
    path: req?.originalUrl || req?.url,
    method: req?.method,
    orgId: req?.orgId ? req.orgId.toString() : undefined,
    userId: req?.user?._id ? req.user._id.toString() : undefined,
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: isProduction ? undefined : err.stack,
    },
  };

  const reqLogger = req?.logger || logger;
  if (statusCode >= 500) {
    reqLogger.error(message, logContext);
  } else {
    reqLogger.warn(message, logContext);
  }

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    error: {
      code: errorCode,
      message: clientMessage,
      ...(requestId ? { requestId } : {}),
    },
    ...(requestId ? { requestId } : {}),
    ...(!isProduction && err.stack ? { stack: err.stack } : {}),
  });
};

export default errorMiddleware;
