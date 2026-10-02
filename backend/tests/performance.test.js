import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import Organization from "../src/models/Organization.js";
import Task from "../src/models/Task.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";
import { connectRedis } from "../src/config/redis.js";
import {
  buildTenantKey,
  getTenantCache,
  setTenantCache,
  invalidateDashboardCache,
} from "../src/services/cache.service.js";

describe("Performance & Scalability Regression Tests (Phase 4)", () => {
  let orgA, orgB;
  let adminA, memberA;
  let tokenAdminA, tokenMemberA;

  before(async () => {
    await connectTestDB();
    await clearTestDB();
    await connectRedis();

    // Tenant A
    orgA = await Organization.create({ name: "Tenant Alpha Performance" });
    const adminAFixture = await createTestUser({
      name: "Admin Alpha",
      email: "admin.alpha@perf.test",
      role: "ADMIN",
      orgId: orgA._id,
    });
    adminA = adminAFixture.user;
    tokenAdminA = `Bearer ${adminAFixture.token}`;

    const memberAFixture = await createTestUser({
      name: "Member Alpha",
      email: "member.alpha@perf.test",
      role: "MEMBER",
      orgId: orgA._id,
    });
    memberA = memberAFixture.user;
    tokenMemberA = `Bearer ${memberAFixture.token}`;

    // Tenant B (for cross-tenant cache isolation verification)
    orgB = await Organization.create({ name: "Tenant Beta Performance" });
    await createTestUser({
      name: "Admin Beta",
      email: "admin.beta@perf.test",
      role: "ADMIN",
      orgId: orgB._id,
    });

    // Ensure model indexes are synchronized
    await Task.syncIndexes();
  });

  after(async () => {
    await disconnectTestDB();
  });

  describe("1. MongoDB Query & Index Optimization", () => {
    it("admin task query with updatedAt sort uses index (IXSCAN) without in-memory SORT", async () => {
      const explainResult = await Task.find({ orgId: orgA._id })
        .sort({ updatedAt: -1 })
        .limit(10)
        .explain("executionStats");

      const winningPlan = explainResult.queryPlanner.winningPlan;

      const findStages = (p) => {
        const stages = [];
        const traverse = (node) => {
          if (!node) return;
          if (node.stage) stages.push(node.stage);
          if (node.inputStage) traverse(node.inputStage);
          if (node.inputStages) node.inputStages.forEach(traverse);
        };
        traverse(p);
        return stages;
      };

      const stages = findStages(winningPlan);

      assert.ok(
        !stages.includes("COLLSCAN"),
        `Query must not perform a full collection scan (COLLSCAN). Found stages: ${stages.join(" -> ")}`
      );
      assert.ok(
        !stages.includes("SORT"),
        `Query must use index ordering and avoid in-memory SORT. Found stages: ${stages.join(" -> ")}`
      );
      assert.ok(
        stages.includes("IXSCAN"),
        `Query must use an index scan (IXSCAN). Found stages: ${stages.join(" -> ")}`
      );
    });

    it("member task query with owner and updatedAt sort uses index without in-memory SORT", async () => {
      const explainResult = await Task.find({
        orgId: orgA._id,
        owner: memberA._id,
      })
        .sort({ updatedAt: -1 })
        .limit(10)
        .explain("executionStats");

      const winningPlan = explainResult.queryPlanner.winningPlan;
      const findStages = (p) => {
        const stages = [];
        const traverse = (node) => {
          if (!node) return;
          if (node.stage) stages.push(node.stage);
          if (node.inputStage) traverse(node.inputStage);
          if (node.inputStages) node.inputStages.forEach(traverse);
        };
        traverse(p);
        return stages;
      };
      const stages = findStages(winningPlan);

      assert.ok(!stages.includes("COLLSCAN"), "Must not use COLLSCAN");
      assert.ok(!stages.includes("SORT"), "Must not use in-memory SORT");
      assert.ok(stages.includes("IXSCAN"), "Must use IXSCAN");
    });
  });

  describe("2. Tenant-Safe Redis Cache & Cross-Tenant Isolation", () => {
    it("enforces tenant prefix in all cache keys", () => {
      const key = buildTenantKey(orgA._id, "dashboard:summary");
      assert.equal(key, `org:${orgA._id.toString()}:dashboard:summary`);

      assert.throws(
        () => buildTenantKey(null, "dashboard:summary"),
        /Tenant isolation violation/,
        "Must throw error if orgId is missing"
      );
    });

    it("prevents cross-tenant cache leakage (Tenant A data cannot be accessed by Tenant B)", async () => {
      const tenantAData = { open: 42, escalated: 0 };
      const tenantBData = { open: 99, escalated: 5 };

      // Set cache for both tenants independently
      await setTenantCache(orgA._id, "dashboard:summary", tenantAData, 60);
      await setTenantCache(orgB._id, "dashboard:summary", tenantBData, 60);

      // Verify Tenant A receives only Tenant A data
      const cachedA = await getTenantCache(orgA._id, "dashboard:summary");
      assert.deepEqual(cachedA, tenantAData);

      // Verify Tenant B receives only Tenant B data
      const cachedB = await getTenantCache(orgB._id, "dashboard:summary");
      assert.deepEqual(cachedB, tenantBData);

      // Assert complete isolation
      assert.notDeepEqual(cachedA, cachedB);
    });

    it("invalidating Tenant A cache leaves Tenant B cache completely intact", async () => {
      // Invalidate only Tenant A
      await invalidateDashboardCache(orgA._id);

      const cachedA = await getTenantCache(orgA._id, "dashboard:summary");
      const cachedB = await getTenantCache(orgB._id, "dashboard:summary");

      assert.equal(cachedA, null, "Tenant A cache must be evicted");
      assert.ok(cachedB !== null, "Tenant B cache must remain untouched");
      assert.equal(cachedB.open, 99);
    });
  });

  describe("3. Cache Invalidation on State Mutations", () => {
    it("creating a task invalidates tenant dashboard cache", async () => {
      // Populate dashboard cache for Tenant A
      await setTenantCache(
        orgA._id,
        "dashboard:summary",
        { open: 10, total: 10 },
        60
      );

      // Verify cache exists
      let cached = await getTenantCache(orgA._id, "dashboard:summary");
      assert.ok(cached !== null);

      // Create new task via API
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", tokenAdminA)
        .send({
          title: "Cache Invalidation Test Task",
          ownerId: memberA._id.toString(),
          ackDeadline: new Date(Date.now() + 3600000).toISOString(),
          actionDeadline: new Date(Date.now() + 7200000).toISOString(),
        });

      assert.equal(res.status, 201);

      // Verify cache was invalidated
      cached = await getTenantCache(orgA._id, "dashboard:summary");
      assert.equal(cached, null, "Dashboard cache must be evicted on task creation");
    });

    it("acknowledging a task invalidates tenant dashboard cache", async () => {
      // Create a task to acknowledge
      const now = Date.now();
      const task = await Task.create({
        orgId: orgA._id,
        title: "Ack Cache Invalidation Task",
        state: TASK_STATES.OPEN,
        owner: memberA._id,
        createdBy: adminA._id,
        ackDeadline: new Date(now + 3600000),
        actionDeadline: new Date(now + 7200000),
      });

      // Warm cache
      await setTenantCache(
        orgA._id,
        "dashboard:summary",
        { open: 1, acknowledged: 0 },
        60
      );

      // Acknowledge task
      const res = await request(app)
        .post(`/api/tasks/${task._id}/ack`)
        .set("Authorization", tokenMemberA);

      assert.equal(res.status, 200);

      // Cache must be evicted
      const cached = await getTenantCache(orgA._id, "dashboard:summary");
      assert.equal(cached, null, "Dashboard cache must be evicted on task state transition");
    });
  });

  describe("4. API Collection Pagination Bounding", () => {
    it("getMyTasks bounds returned documents and supports pagination", async () => {
      const res = await request(app)
        .get("/api/tasks/my?page=1&limit=5")
        .set("Authorization", tokenMemberA);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.tasks));
      assert.ok(res.body.tasks.length <= 5, "Must not return more than limit");
    });
  });
});
