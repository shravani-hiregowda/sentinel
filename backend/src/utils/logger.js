/**
 * Sentinel Structured Logging System
 *
 * Provides production-ready, machine-readable JSON logging with:
 * - Configurable log levels (DEBUG, INFO, WARN, ERROR)
 * - Contextual child loggers (requestId, orgId, userId, workerId, etc.)
 * - Automatic sensitive field sanitization/redaction
 * - Safe serialization preventing circular reference crashes
 */

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_REGEX = /password|token|secret|authorization|cookie|twilio|key|credential/i;

/**
 * Recursively redacts sensitive values from objects or arrays.
 */
export const sanitizeData = (data, seen = new WeakSet()) => {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (seen.has(data)) return "[Circular]";
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: value.message,
        code: value.code,
        ...(process.env.NODE_ENV !== "production" ? { stack: value.stack } : {}),
      };
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeData(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

class StructuredLogger {
  constructor(bindings = {}) {
    this.bindings = {
      service: process.env.SERVICE_NAME || "sentinel-api",
      environment: process.env.NODE_ENV || "development",
      ...bindings,
    };
  }

  _shouldLog(level) {
    const currentLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "debug" : "info")).toLowerCase();
    const threshold = LOG_LEVELS[currentLevel] ?? LOG_LEVELS.info;
    const target = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    return target >= threshold;
  }

  _formatLog(level, message, meta = {}) {
    let msg = message;
    let extra = meta;

    if (typeof message === "object" && message !== null) {
      extra = { ...message, ...meta };
      msg = extra.message || "";
      delete extra.message;
    }

    if (extra instanceof Error) {
      extra = {
        error: {
          name: extra.name,
          message: extra.message,
          code: extra.code,
          ...(process.env.NODE_ENV !== "production" ? { stack: extra.stack } : {}),
        },
      };
    } else if (extra.error instanceof Error) {
      extra.error = {
        name: extra.error.name,
        message: extra.error.message,
        code: extra.error.code,
        ...(process.env.NODE_ENV !== "production" ? { stack: extra.error.stack } : {}),
      };
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      ...this.bindings,
      ...(msg ? { message: msg } : {}),
      ...sanitizeData(extra),
    };

    return JSON.stringify(payload);
  }

  _output(level, logString) {
    if (level === "error") {
      process.stderr.write(logString + "\n");
    } else {
      process.stdout.write(logString + "\n");
    }
  }

  debug(message, meta) {
    if (this._shouldLog("debug")) {
      this._output("debug", this._formatLog("debug", message, meta));
    }
  }

  info(message, meta) {
    if (this._shouldLog("info")) {
      this._output("info", this._formatLog("info", message, meta));
    }
  }

  warn(message, meta) {
    if (this._shouldLog("warn")) {
      this._output("warn", this._formatLog("warn", message, meta));
    }
  }

  error(message, meta) {
    if (this._shouldLog("error")) {
      this._output("error", this._formatLog("error", message, meta));
    }
  }

  child(bindings = {}) {
    return new StructuredLogger({
      ...this.bindings,
      ...bindings,
    });
  }
}

export const logger = new StructuredLogger();
export default logger;
