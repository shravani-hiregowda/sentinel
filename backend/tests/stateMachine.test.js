import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  canTransition,
  validateTransition,
  transitionTask,
} from "../src/services/taskStateMachine.service.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import Organization from "../src/models/Organization.js";
import Task from "../src/models/Task.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";

describe("Task State Machine", () => {
  let org;
  let admin;
  let member;

  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    org = await Organization.create({ name: "State Machine Test Org" });
    const adminFixture = await createTestUser({
      name: "Admin User",
      email: "admin@sm-test.com",
      role: "ADMIN",
      orgId: org._id,
    });
    admin = adminFixture.user;

    const memberFixture = await createTestUser({
      name: "Member User",
      email: "member@sm-test.com",
      role: "MEMBER",
      orgId: org._id,
    });
    member = memberFixture.user;
  });

  describe("canTransition & validateTransition unit rules", () => {
    it("should allow OPEN -> ACKNOWLEDGED", () => {
      assert.equal(canTransition(TASK_STATES.OPEN, TASK_STATES.ACKNOWLEDGED), true);
      assert.equal(validateTransition(TASK_STATES.OPEN, TASK_STATES.ACKNOWLEDGED), true);
    });

    it("should allow ACKNOWLEDGED -> IN_PROGRESS", () => {
      assert.equal(canTransition(TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS), true);
      assert.equal(validateTransition(TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS), true);
    });

    it("should allow IN_PROGRESS -> CLOSED", () => {
      assert.equal(canTransition(TASK_STATES.IN_PROGRESS, TASK_STATES.CLOSED), true);
      assert.equal(validateTransition(TASK_STATES.IN_PROGRESS, TASK_STATES.CLOSED), true);
    });

    it("should allow ACKNOWLEDGED -> CLOSED", () => {
      assert.equal(canTransition(TASK_STATES.ACKNOWLEDGED, TASK_STATES.CLOSED), true);
      assert.equal(validateTransition(TASK_STATES.ACKNOWLEDGED, TASK_STATES.CLOSED), true);
    });

    it("should allow OPEN -> ESCALATED and IN_PROGRESS -> ESCALATED", () => {
      assert.equal(canTransition(TASK_STATES.OPEN, TASK_STATES.ESCALATED), true);
      assert.equal(canTransition(TASK_STATES.IN_PROGRESS, TASK_STATES.ESCALATED), true);
    });

    it("should allow ESCALATED -> OPEN (reassignment)", () => {
      assert.equal(canTransition(TASK_STATES.ESCALATED, TASK_STATES.OPEN), true);
    });

    it("should reject CLOSED -> OPEN with HTTP 409", () => {
      assert.equal(canTransition(TASK_STATES.CLOSED, TASK_STATES.OPEN), false);
      assert.throws(
        () => validateTransition(TASK_STATES.CLOSED, TASK_STATES.OPEN),
        (err) => err.statusCode === 409
      );
    });

    it("should reject CLOSED -> IN_PROGRESS with HTTP 409", () => {
      assert.equal(canTransition(TASK_STATES.CLOSED, TASK_STATES.IN_PROGRESS), false);
      assert.throws(
        () => validateTransition(TASK_STATES.CLOSED, TASK_STATES.IN_PROGRESS),
        (err) => err.statusCode === 409
      );
    });

    it("should reject OPEN -> CLOSED with HTTP 409", () => {
      assert.equal(canTransition(TASK_STATES.OPEN, TASK_STATES.CLOSED), false);
      assert.throws(
        () => validateTransition(TASK_STATES.OPEN, TASK_STATES.CLOSED),
        (err) => err.statusCode === 409
      );
    });

    it("should reject OPEN -> IN_PROGRESS with HTTP 409", () => {
      assert.equal(canTransition(TASK_STATES.OPEN, TASK_STATES.IN_PROGRESS), false);
      assert.throws(
        () => validateTransition(TASK_STATES.OPEN, TASK_STATES.IN_PROGRESS),
        (err) => err.statusCode === 409
      );
    });
  });

  describe("transitionTask execution & auditable history", () => {
    it("should transition OPEN -> ACKNOWLEDGED and create an audit log with orgId", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Test Task 1",
        owner: member._id,
        ackDeadline: new Date(Date.now() + 3600000),
        actionDeadline: new Date(Date.now() + 86400000),
        createdBy: admin._id,
        state: TASK_STATES.OPEN,
      });

      const result = await transitionTask({
        task,
        toState: TASK_STATES.ACKNOWLEDGED,
        actor: member,
        triggeredBy: "USER",
        orgId: org._id,
      });

      assert.equal(result.task.state, TASK_STATES.ACKNOWLEDGED);

      // Verify audit record in database
      const transitions = await TaskStateTransition.find({ task: task._id });
      assert.equal(transitions.length, 1);
      assert.equal(transitions[0].fromState, TASK_STATES.OPEN);
      assert.equal(transitions[0].toState, TASK_STATES.ACKNOWLEDGED);
      assert.equal(transitions[0].orgId.toString(), org._id.toString());
      assert.equal(transitions[0].triggeredBy, "USER");
      assert.equal(transitions[0].actor.toString(), member._id.toString());
    });

    it("should reject transition if orgId does not match task orgId", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Test Task 2",
        owner: member._id,
        ackDeadline: new Date(Date.now() + 3600000),
        actionDeadline: new Date(Date.now() + 86400000),
        createdBy: admin._id,
        state: TASK_STATES.OPEN,
      });

      const foreignOrgId = new mongoose.Types.ObjectId();

      await assert.rejects(
        async () => {
          await transitionTask({
            task,
            toState: TASK_STATES.ACKNOWLEDGED,
            actor: member,
            triggeredBy: "USER",
            orgId: foreignOrgId,
          });
        },
        (err) => err.statusCode === 404
      );
    });

    it("should reject invalid transition on saved task and not alter state", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Test Task 3",
        owner: member._id,
        ackDeadline: new Date(Date.now() + 3600000),
        actionDeadline: new Date(Date.now() + 86400000),
        createdBy: admin._id,
        state: TASK_STATES.CLOSED,
      });

      await assert.rejects(
        async () => {
          await transitionTask({
            task,
            toState: TASK_STATES.OPEN,
            actor: admin,
            triggeredBy: "ADMIN",
            orgId: org._id,
          });
        },
        (err) => err.statusCode === 409
      );

      // Check task in DB was not modified
      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.CLOSED);
    });
  });
});
