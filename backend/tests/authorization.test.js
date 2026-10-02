import { describe, it, before, beforeEach, after } from "node:test";
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

describe("Authorization Tests (RBAC & Resource Ownership)", () => {
  let org;
  let admin, tokenAdmin;
  let member1, tokenMember1;
  let member2, tokenMember2;
  let taskOwnedByMember1;

  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    org = await Organization.create({ name: "Auth Test Org" });

    const adminFixture = await createTestUser({
      name: "Admin User",
      email: "admin@authtest.com",
      role: "ADMIN",
      orgId: org._id,
    });
    admin = adminFixture.user;
    tokenAdmin = adminFixture.token;

    const member1Fixture = await createTestUser({
      name: "Member 1",
      email: "m1@authtest.com",
      role: "MEMBER",
      orgId: org._id,
    });
    member1 = member1Fixture.user;
    tokenMember1 = member1Fixture.token;

    const member2Fixture = await createTestUser({
      name: "Member 2",
      email: "m2@authtest.com",
      role: "MEMBER",
      orgId: org._id,
    });
    member2 = member2Fixture.user;
    tokenMember2 = member2Fixture.token;

    taskOwnedByMember1 = await Task.create({
      orgId: org._id,
      title: "Member 1 Task",
      owner: member1._id,
      createdBy: admin._id,
      state: TASK_STATES.OPEN,
      ackDeadline: new Date(Date.now() + 3600000),
      actionDeadline: new Date(Date.now() + 86400000),
    });
  });

  describe("Unauthenticated requests", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/tasks/my");
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("returns 401 when invalid token is provided", async () => {
      const res = await request(app)
        .get("/api/tasks/my")
        .set("Authorization", "Bearer invalid_garbage_token");
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });
  });

  describe("Role-based permissions (MEMBER vs ADMIN)", () => {
    it("MEMBER cannot create tasks (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${tokenMember1}`)
        .send({
          title: "Unauthorized Task",
          ownerId: member1._id,
          ackDeadline: new Date(Date.now() + 3600000),
          actionDeadline: new Date(Date.now() + 86400000),
        });

      assert.equal(res.status, 403);
    });

    it("MEMBER cannot access admin task list (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .get("/api/admin/tasks")
        .set("Authorization", `Bearer ${tokenMember1}`);

      assert.equal(res.status, 403);
    });

    it("MEMBER cannot reassign tasks (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/admin/tasks/${taskOwnedByMember1._id}/reassign`)
        .set("Authorization", `Bearer ${tokenMember1}`)
        .send({ newOwnerId: member2._id });

      assert.equal(res.status, 403);
    });

    it("MEMBER cannot access admin dashboard (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard/summary")
        .set("Authorization", `Bearer ${tokenMember1}`);

      assert.equal(res.status, 403);
    });

    it("MEMBER cannot create new members (returns 403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/users/create-member")
        .set("Authorization", `Bearer ${tokenMember1}`)
        .send({
          name: "Attacker",
          email: "attacker@test.com",
          password: "Password@123",
        });

      assert.equal(res.status, 403);
    });

    it("ADMIN can create tasks successfully (returns 201 Created)", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          title: "Legitimate Admin Task",
          ownerId: member1._id,
          ackDeadline: new Date(Date.now() + 3600000),
          actionDeadline: new Date(Date.now() + 86400000),
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
    });
  });

  describe("Resource ownership authorization (Same tenant, different owner)", () => {
    it("Member 2 cannot acknowledge a task owned by Member 1 (returns 403)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskOwnedByMember1._id}/ack`)
        .set("Authorization", `Bearer ${tokenMember2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.message, "You are not the task owner");
    });

    it("Member 2 cannot start a task owned by Member 1 (returns 403)", async () => {
      taskOwnedByMember1.state = TASK_STATES.ACKNOWLEDGED;
      await taskOwnedByMember1.save();

      const res = await request(app)
        .post(`/api/tasks/${taskOwnedByMember1._id}/start`)
        .set("Authorization", `Bearer ${tokenMember2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.message, "You are not the task owner");
    });

    it("Member 2 cannot complete a task owned by Member 1 (returns 403)", async () => {
      taskOwnedByMember1.state = TASK_STATES.IN_PROGRESS;
      await taskOwnedByMember1.save();

      const res = await request(app)
        .post(`/api/tasks/${taskOwnedByMember1._id}/complete`)
        .set("Authorization", `Bearer ${tokenMember2}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.message, "You are not the task owner");
    });

    it("Owner Member 1 can acknowledge their own task (returns 200)", async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskOwnedByMember1._id}/ack`)
        .set("Authorization", `Bearer ${tokenMember1}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.state, TASK_STATES.ACKNOWLEDGED);
    });
  });
});
