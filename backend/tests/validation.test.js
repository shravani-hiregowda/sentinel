import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app.js";
import Organization from "../src/models/Organization.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";
import { ROLES } from "../src/enums/roles.js";

describe("Request Validation Middleware", () => {
  let org;
  let admin;
  let adminToken;
  let member;

  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    org = await Organization.create({ name: "Validation Test Org" });

    const adminData = await createTestUser({
      name: "Admin User",
      email: "admin@validation.test",
      role: ROLES.ADMIN,
      orgId: org._id,
    });
    admin = adminData.user;
    adminToken = adminData.token;

    const memberData = await createTestUser({
      name: "Member User",
      email: "member@validation.test",
      role: ROLES.MEMBER,
      orgId: org._id,
    });
    member = memberData.user;
  });

  describe("Task Creation Validation", () => {
    test("rejects task creation without title", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ownerId: member._id.toString(),
          ackDeadline: new Date(Date.now() + 3600000).toISOString(),
          actionDeadline: new Date(Date.now() + 7200000).toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, "VALIDATION_ERROR");
      assert.match(res.body.message, /Task title is required/);
    });

    test("rejects task creation with non-ObjectId ownerId", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Valid Title",
          ownerId: "invalid-mongo-id-123",
          ackDeadline: new Date(Date.now() + 3600000).toISOString(),
          actionDeadline: new Date(Date.now() + 7200000).toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Invalid or missing task owner ID/);
    });

    test("rejects task creation where actionDeadline is before ackDeadline", async () => {
      const now = Date.now();
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Deadline order test",
          ownerId: member._id.toString(),
          ackDeadline: new Date(now + 7200000).toISOString(), // 2 hours
          actionDeadline: new Date(now + 3600000).toISOString(), // 1 hour (invalid)
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /actionDeadline must be strictly later/);
    });
  });

  describe("Route Param Validation (ObjectId)", () => {
    test("rejects malformed ObjectId in task ack route with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/tasks/not-a-valid-object-id/ack")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, "INVALID_ID");
      assert.equal(res.body.message, "Invalid resource ID");
    });

    test("rejects malformed ObjectId in task timeline route with 400 Bad Request", async () => {
      const res = await request(app)
        .get("/api/tasks/abc-xyz-123/timeline")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, "INVALID_ID");
    });
  });

  describe("Admin Task Query Parameter Validation", () => {
    test("rejects negative page number in admin task listing", async () => {
      const res = await request(app)
        .get("/api/admin/tasks?page=-1")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Page query parameter must be a positive integer/);
    });

    test("rejects limit greater than 100", async () => {
      const res = await request(app)
        .get("/api/admin/tasks?limit=500")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Limit query parameter must be an integer between 1 and 100/);
    });

    test("rejects unknown state filter parameter", async () => {
      const res = await request(app)
        .get("/api/admin/tasks?state=NOT_A_REAL_STATE")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Invalid state filter/);
    });
  });

  describe("Member Creation Validation", () => {
    test("rejects member creation with invalid email", async () => {
      const res = await request(app)
        .post("/api/users/create-member")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "not-an-email",
          password: "SecurePassword123",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Valid email is required/);
    });

    test("rejects member creation with password shorter than 6 characters", async () => {
      const res = await request(app)
        .post("/api/users/create-member")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test User",
          email: "valid@email.com",
          password: "123",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /Password must be at least 6 characters/);
    });
  });
});
