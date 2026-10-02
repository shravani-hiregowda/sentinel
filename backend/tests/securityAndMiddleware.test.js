import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import app from "../src/app.js";
import { connectTestDB, disconnectTestDB } from "./setup.js";
import { createCustomLimiter } from "../src/middlewares/rateLimit.middleware.js";
import errorMiddleware from "../src/middlewares/error.middleware.js";
import correlationMiddleware from "../src/middlewares/requestId.middleware.js";

describe("Security Middleware & Request Correlation", () => {
  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  describe("Security Headers (Helmet)", () => {
    test("sets standard security headers on API responses", async () => {
      const res = await request(app).get("/health");

      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
      assert.equal(res.headers["x-download-options"], "noopen");
      assert.equal(res.headers["x-permitted-cross-domain-policies"], "none");
    });
  });

  describe("Request Correlation IDs", () => {
    test("automatically generates and returns X-Request-ID if not supplied", async () => {
      const res = await request(app).get("/health");

      assert.ok(res.headers["x-request-id"]);
      assert.match(res.headers["x-request-id"], /^req_[a-f0-9-]+$/);
    });

    test("preserves valid client-supplied X-Request-ID header", async () => {
      const clientTraceId = "client-trace-abc-123";
      const res = await request(app)
        .get("/health")
        .set("X-Request-ID", clientTraceId);

      assert.equal(res.headers["x-request-id"], clientTraceId);
    });

    test("sanitizes malicious or invalid characters in X-Request-ID header", async () => {
      const invalidId = "invalid <script>alert(1)</script> header with spaces";
      const res = await request(app)
        .get("/health")
        .set("X-Request-ID", invalidId);

      // Should have generated a safe req_ UUID instead
      assert.match(res.headers["x-request-id"], /^req_[a-f0-9-]+$/);
    });

  });

  describe("CORS Configuration", () => {
    test("allows requests from whitelisted origins", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:3000");

      assert.equal(res.headers["access-control-allow-origin"], "http://localhost:3000");
    });

    test("rejects or omits CORS headers for unauthorized external origins", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://malicious-phishing-site.com");

      // In hardened CORS, unlisted origins do not receive Allow-Origin
      assert.notEqual(
        res.headers["access-control-allow-origin"],
        "https://malicious-phishing-site.com"
      );
    });
  });

  describe("Rate Limiting", () => {
    test("returns 429 Too Many Requests when rate limit threshold is exceeded", async () => {
      const testApp = express();
      const limiter = createCustomLimiter({ max: 2, windowMs: 10000 });
      testApp.use(correlationMiddleware);
      testApp.use(limiter);
      testApp.get("/test-limited", (req, res) => res.json({ ok: true }));

      // Request 1: OK
      const res1 = await request(testApp).get("/test-limited");
      assert.equal(res1.status, 200);

      // Request 2: OK
      const res2 = await request(testApp).get("/test-limited");
      assert.equal(res2.status, 200);

      // Request 3: Exceeded -> 429
      const res3 = await request(testApp).get("/test-limited");
      assert.equal(res3.status, 429);
      assert.equal(res3.body.success, false);
      assert.equal(res3.body.error.code, "RATE_LIMIT_EXCEEDED");
      assert.match(res3.body.message, /Too many requests/);
      assert.ok(res3.body.error.requestId || res3.body.requestId);
    });
  });

  describe("Global Error Handling", () => {
    test("formats unexpected errors into standardized safe response shape", async () => {
      const testApp = express();
      testApp.use(correlationMiddleware);
      testApp.get("/error-trigger", (req, res, next) => {
        const error = new Error("Database query failed unexpectedly");
        error.statusCode = 500;
        next(error);
      });
      testApp.use(errorMiddleware);

      const res = await request(testApp).get("/error-trigger");

      assert.equal(res.status, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, "INTERNAL_SERVER_ERROR");
      assert.ok(res.body.error.requestId);
    });

    test("does not expose stack traces when NODE_ENV=production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const testApp = express();
        testApp.use(correlationMiddleware);
        testApp.get("/prod-error", (req, res, next) => {
          next(new Error("Sensitive internal driver error"));
        });
        testApp.use(errorMiddleware);

        const res = await request(testApp).get("/prod-error");

        assert.equal(res.status, 500);
        assert.equal(res.body.message, "An unexpected error occurred");
        assert.equal(res.body.stack, undefined);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
