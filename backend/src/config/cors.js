/**
 * Production-hardened CORS configuration
 *
 * Guarantees:
 * 1. Never uses wildcard `*` for authenticated production endpoints.
 * 2. Origin whitelist strictly sourced from CLIENT_ORIGIN / CORS_ORIGIN environment variables.
 * 3. Default safe development origins permitted in non-production environments.
 * 4. Reusable across both Express HTTP server and Socket.io.
 */

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

export const getAllowedOrigins = () => {
  const configured = process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || "";
  const list = configured
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    DEFAULT_DEV_ORIGINS.forEach((devOrigin) => {
      if (!list.includes(devOrigin)) {
        list.push(devOrigin);
      }
    });
  }

  return list;
};

export const getCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, or test runners)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Origin not permitted
      const error = new Error(`CORS policy: Origin '${origin}' is not permitted.`);
      error.statusCode = 403;
      return callback(error, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"],
    maxAge: 86400, // 24 hours preflight cache
  };
};

export default getCorsOptions;
