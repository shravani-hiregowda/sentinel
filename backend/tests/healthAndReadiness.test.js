import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app.js";
import { connectTestDB, disconnectTestDB } from "./setup.js";
import { connectRedis, getRedisConnection } from "../src/config/redis.js";

describe("Health & Readiness Endpoints", () => {
  before(async () => {
    await connectTestDB();
    await connectRedis();
  });

  after(async () => {
    await disconnectTestDB();
  });

  it("GET /health returns 200 OK with process metadata", async () => {
    const res = await request(app).get("/health");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "sentinel-api");
    assert.ok(res.body.timestamp);
    assert.equal(typeof res.body.uptime, "number");
  });

  it("GET /ready returns 200 when MongoDB and Redis are reachable", async () => {
    const res = await request(app).get("/ready");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ready");
    assert.equal(res.body.service, "sentinel-api");
    assert.equal(res.body.checks.mongodb.status, "up");
    assert.equal(res.body.checks.redis.status, "up");
  });

  it("GET /ready returns 503 when MongoDB is down", async () => {
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 0,
      configurable: true,
      writable: true,
    });

    try {
      const res = await request(app).get("/ready");

      assert.equal(res.status, 503);
      assert.equal(res.body.status, "not_ready");
      assert.equal(res.body.checks.mongodb.status, "down");
    } finally {
      Object.defineProperty(mongoose.connection, "readyState", {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    }
  });


  it("GET /ready returns 503 when Redis is unavailable", async () => {
    const client = getRedisConnection();
    const originalStatus = client.status;

    // Simulate disconnected Redis client state
    client.status = "end";

    try {
      const res = await request(app).get("/ready");

      assert.equal(res.status, 503);
      assert.equal(res.body.status, "not_ready");
      assert.equal(res.body.checks.redis.status, "down");
      assert.match(res.body.checks.redis.error, /Redis client is not ready/);
    } finally {
      client.status = originalStatus;
    }
  });
});
