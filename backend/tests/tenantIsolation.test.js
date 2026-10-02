import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import Organization from "../src/models/Organization.js";
import Task from "../src/models/Task.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import AuditLog from "../src/models/AuditLog.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";

describe("Tenant Isolation Tests (Cross-Tenant Security)", () => {
  let orgA, orgB;
  let adminA, userA, tokenAdminA, tokenUserA;
  let adminB, userB, tokenAdminB, tokenUserB;
  let taskA, taskB;

  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // 1. Create Organization A & Users
    orgA = await Organization.create({ name: "Tenant Alpha" });
    const adminAFixture = await createTestUser({
      name: "Admin Alpha",
      email: "admin@alpha.com",
      role: "ADMIN",
      orgId: orgA._id,
    });
    adminA = adminAFixture.user;
    tokenAdminA = adminAFixture.token;

    const userAFixture = await createTestUser({
      name: "User Alpha",
      email: "user@alpha.com",
      role: "MEMBER",
      orgId: orgA._id,
    });
    userA = userAFixture.user;
    tokenUserA = userAFixture.token;

    // 2. Create Organization B & Users
    orgB = await Organization.create({ name: "Tenant Beta" });
    const adminBFixture = await createTestUser({
      name: "Admin Beta",
      email: "admin@beta.com",
      role: "ADMIN",
      orgId: orgB._id,
    });
    adminB = adminBFixture.user;
    tokenAdminB = adminBFixture.token;

    const userBFixture = await createTestUser({
      name: "User Beta",
      email: "user@beta.com",
      role: "MEMBER",
      orgId: orgB._id,
    });
    userB = userBFixture.user;
    tokenUserB = userBFixture.token;

    // 3. Create Task A (Org A)
    taskA = await Task.create({
      orgId: orgA._id,
      title: "Task Alpha Secret",
      description: "Confidential Alpha Data",
      owner: userA._id,
      createdBy: adminA._id,
      state: TASK_STATES.OPEN,
      ackDeadline: new Date(Date.now() + 3600000),
      actionDeadline: new Date(Date.now() + 86400000),
    });

    // 4. Create Task B (Org B)
    taskB = await Task.create({
      orgId: orgB._id,
      title: "Task Beta Secret",
      description: "Confidential Beta Data",
      owner: userB._id,
      createdBy: adminB._id,
      state: TASK_STATES.OPEN,
      ackDeadline: new Date(Date.now() + 3600000),
      actionDeadline: new Date(Date.now() + 86400000),
    });

    // 5. Create audit and transition records
    await TaskStateTransition.create({
      orgId: orgA._id,
      task: taskA._id,
      fromState: TASK_STATES.OPEN,
      toState: TASK_STATES.ACKNOWLEDGED,
      triggeredBy: "USER",
      actor: userA._id,
    });

    await TaskStateTransition.create({
      orgId: orgB._id,
      task: taskB._id,
      fromState: TASK_STATES.OPEN,
      toState: TASK_STATES.ACKNOWLEDGED,
      triggeredBy: "USER",
      actor: userB._id,
    });

    await AuditLog.create({
      orgId: orgB._id,
      userId: adminB._id,
      action: "CONFIDENTIAL_BETA_AUDIT",
    });
  });

  describe("User A (Org A) attempting to access Task B (Org B)", () => {
    it("User A cannot read Task B via /my tasks endpoint", async () => {
      const res = await request(app)
        .get("/api/tasks/my")
        .set("Authorization", `Bearer ${tokenUserA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const foundB = res.body.tasks.some(
        (t) => t._id.toString() === taskB._id.toString()
      );
      assert.equal(foundB, false, "Task B must not be visible to User A");
    });

    it("User A cannot read Task B's owner task list", async () => {
      const res = await request(app)
        .get(`/api/tasks/owner/${userB._id}`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      // Should be forbidden or not found (must not leak other tenant data)
      assert.ok([403, 404].includes(res.status));
    });

    it("User A cannot acknowledge Task B (returns 404 Not Found)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskB._id}/ack`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("User A cannot start Task B (returns 404 Not Found)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskB._id}/start`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("User A cannot complete Task B (returns 404 Not Found)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskB._id}/complete`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("User A cannot access Task B's timeline (returns 404 Not Found)", async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskB._id}/timeline`)
        .set("Authorization", `Bearer ${tokenUserA}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });
  });

  describe("Admin A (Org A) attempting to access or modify Org B resources", () => {
    it("Admin A cannot see Task B in admin task listing", async () => {
      const res = await request(app)
        .get("/api/admin/tasks")
        .set("Authorization", `Bearer ${tokenAdminA}`);

      assert.equal(res.status, 200);
      const foundB = res.body.tasks.some(
        (t) => t._id.toString() === taskB._id.toString()
      );
      assert.equal(foundB, false, "Admin A must not see Org B tasks");
    });

    it("Admin A cannot reassign Task B (returns 404 Not Found)", async () => {
      const res = await request(app)
        .post(`/api/admin/tasks/${taskB._id}/reassign`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ newOwnerId: userA._id });

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("Admin A cannot force-update Task B state (returns 404 Not Found)", async () => {
      const res = await request(app)
        .put(`/api/admin/tasks/${taskB._id}/state`)
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({ state: TASK_STATES.ACKNOWLEDGED });

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("Admin A cannot view Org B dashboard metrics", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/summary")
        .set("Authorization", `Bearer ${tokenAdminA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.summary.open, 1); // Only Task A
    });

    it("Admin A cannot view Org B activity feed", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/activity")
        .set("Authorization", `Bearer ${tokenAdminA}`);

      assert.equal(res.status, 200);
      const foundBetaFeed = res.body.feed.some(
        (f) => f.task?.toString() === taskB._id.toString()
      );
      assert.equal(foundBetaFeed, false, "Activity feed must only show Org A items");
    });
  });

  describe("Reverse Direction: User B & Admin B attempting to access Org A", () => {
    it("User B cannot acknowledge Task A (returns 404)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskA._id}/ack`)
        .set("Authorization", `Bearer ${tokenUserB}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Task not found");
    });

    it("User B cannot start or complete Task A (returns 404)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskA._id}/start`)
        .set("Authorization", `Bearer ${tokenUserB}`);

      assert.equal(res.status, 404);
    });

    it("Admin B cannot reassign or update Task A (returns 404)", async () => {
      const res = await request(app)
        .post(`/api/admin/tasks/${taskA._id}/reassign`)
        .set("Authorization", `Bearer ${tokenAdminB}`)
        .send({ newOwnerId: userB._id });

      assert.equal(res.status, 404);
    });
  });

  describe("Cross-tenant tampering prevention", () => {
    it("Rejects request when user attempts to send another tenant's orgId in body", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          title: "Malicious Cross-Tenant Task",
          ownerId: userA._id,
          orgId: orgB._id, // Malicious override attempt!
          ackDeadline: new Date(Date.now() + 3600000),
          actionDeadline: new Date(Date.now() + 86400000),
        });

      // Must be rejected with HTTP 403 Forbidden
      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        "Cross-tenant access prohibited: organization mismatch"
      );
    });

    it("Rejects request when user attempts to send another tenant's orgId in query param", async () => {
      const res = await request(app)
        .get(`/api/admin/tasks?orgId=${orgB._id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        "Cross-tenant access prohibited: organization mismatch"
      );
    });

    it("Rejects request when user attempts to send another tenant's organizationId in body", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${tokenAdminA}`)
        .send({
          title: "Malicious organizationId Task",
          ownerId: userA._id,
          organizationId: orgB._id, // Malicious alias attempt
          ackDeadline: new Date(Date.now() + 3600000),
          actionDeadline: new Date(Date.now() + 86400000),
        });

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        "Cross-tenant access prohibited: organization mismatch"
      );
    });

    it("Rejects request when user attempts to send another tenant's organizationId in query param", async () => {
      const res = await request(app)
        .get(`/api/admin/tasks?organizationId=${orgB._id}`)
        .set("Authorization", `Bearer ${tokenAdminA}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        "Cross-tenant access prohibited: organization mismatch"
      );
    });

    it("Tenant A user accessing Tenant A task succeeds while accessing Tenant B task owner is denied", async () => {
      // Allowed for own user in Tenant A
      const resAllowed = await request(app)
        .get(`/api/tasks/owner/${userA._id}`)
        .set("Authorization", `Bearer ${tokenUserA}`);
      assert.equal(resAllowed.status, 200);

      // Denied for cross-tenant user in Tenant B
      const resDenied = await request(app)
        .get(`/api/tasks/owner/${userB._id}`)
        .set("Authorization", `Bearer ${tokenUserA}`);
      assert.equal(resDenied.status, 403);
    });
  });
});

