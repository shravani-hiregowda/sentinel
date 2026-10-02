import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Organization from "../src/models/Organization.js";
import Task from "../src/models/Task.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import EscalationEvent from "../src/models/EscalationEvent.js";
import AuditLog from "../src/models/AuditLog.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import { ROLES } from "../src/enums/roles.js";
import { ESCALATION_REASONS } from "../src/enums/escalationReasons.js";
import { processTaskEscalation } from "../src/services/escalationService.js";

import { executeTeardown } from "../src/utils/shutdown.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
} from "./setup.js";

describe("Worker Reliability, Idempotency & Graceful Shutdown", () => {
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

    org = await Organization.create({ name: "Reliability Test Org" });

    const adminData = await createTestUser({
      name: "Admin User",
      email: "admin@reliability.test",
      role: ROLES.ADMIN,
      orgId: org._id,
    });
    admin = adminData.user;

    const memberData = await createTestUser({
      name: "Member User",
      email: "member@reliability.test",
      role: ROLES.MEMBER,
      orgId: org._id,
    });
    member = memberData.user;
  });

  describe("SLA Escalation Idempotency", () => {
    test("repeated execution of the same escalation job produces only one state transition and audit entry", async () => {
      const now = new Date();
      const task = await Task.create({
        orgId: org._id,
        title: "Idempotency Test Task",
        state: TASK_STATES.OPEN,
        owner: member._id,
        ackDeadline: new Date(now.getTime() - 10000), // Expired
        actionDeadline: new Date(now.getTime() + 3600000),
        slaVersion: 1,
        createdBy: admin._id,
      });

      const jobPayload = {
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      };

      // First execution -> succeeds
      const result1 = await processTaskEscalation(jobPayload);
      assert.equal(result1.escalated, true);
      assert.equal(result1.newState, TASK_STATES.ESCALATED);

      // Verify DB state
      const taskAfterFirst = await Task.findById(task._id);
      assert.equal(taskAfterFirst.state, TASK_STATES.ESCALATED);
      assert.equal(taskAfterFirst.owner.toString(), admin._id.toString());

      // Second execution (duplicate job / retry) -> safely skipped as no-op
      const result2 = await processTaskEscalation(jobPayload);
      assert.equal(result2.skipped, true);
      assert.equal(result2.reason, "NOT_IN_OPEN_STATE");

      // Verify NO duplicate side-effects
      const transitions = await TaskStateTransition.find({ task: task._id });
      assert.equal(transitions.length, 1);

      const escalationEvents = await EscalationEvent.find({ task: task._id });
      assert.equal(escalationEvents.length, 1);

      const auditLogs = await AuditLog.find({ "meta.taskId": task._id });
      assert.equal(auditLogs.length, 1);
    });
  });

  describe("Stale Job Protection", () => {
    test("ignores job when slaVersion is older than current task slaVersion", async () => {
      const now = new Date();
      const task = await Task.create({
        orgId: org._id,
        title: "Stale Job Test Task",
        state: TASK_STATES.OPEN,
        owner: member._id,
        ackDeadline: new Date(now.getTime() - 5000),
        actionDeadline: new Date(now.getTime() + 3600000),
        slaVersion: 3, // Current version is 3
        createdBy: admin._id,
      });

      const staleJobPayload = {
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1, // Stale job version
      };

      const result = await processTaskEscalation(staleJobPayload);
      assert.equal(result.skipped, true);
      assert.equal(result.reason, "STALE_JOB");

      // Task remains OPEN
      const unchangedTask = await Task.findById(task._id);
      assert.equal(unchangedTask.state, TASK_STATES.OPEN);
      assert.equal(unchangedTask.owner.toString(), member._id.toString());
    });
  });

  describe("Concurrent Worker Execution Safety", () => {
    test("racing two worker executions concurrently results in exactly one valid escalation", async () => {
      const now = new Date();
      const task = await Task.create({
        orgId: org._id,
        title: "Concurrency Race Task",
        state: TASK_STATES.OPEN,
        owner: member._id,
        ackDeadline: new Date(now.getTime() - 10000),
        actionDeadline: new Date(now.getTime() + 3600000),
        slaVersion: 1,
        createdBy: admin._id,
      });

      const jobPayload = {
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      };

      // Run both concurrently
      const [res1, res2] = await Promise.all([
        processTaskEscalation(jobPayload),
        processTaskEscalation(jobPayload),
      ]);

      const oneEscalated = (res1.escalated && !res2.escalated) || (!res1.escalated && res2.escalated);
      assert.ok(oneEscalated, "Exactly one execution should succeed");

      const transitions = await TaskStateTransition.find({ task: task._id });
      assert.equal(transitions.length, 1);
    });
  });

  describe("Graceful Shutdown Handler", () => {
    test("executeTeardown closes provided mock server and worker without throwing", async () => {
      let serverClosed = false;
      let workerClosed = false;

      const mockServer = {
        close: (cb) => {
          serverClosed = true;
          cb(null);
        },
      };

      const mockWorker = {
        close: async () => {
          workerClosed = true;
        },
      };

      await executeTeardown(
        { server: mockServer, worker: mockWorker },
        { timeoutMs: 2000, exitProcess: false }
      );

      assert.equal(serverClosed, true);
      assert.equal(workerClosed, true);
    });
  });
});
