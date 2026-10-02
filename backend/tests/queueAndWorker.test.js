import { describe, it, before, beforeEach, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Queue } from "bullmq";
import Organization from "../src/models/Organization.js";
import Task from "../src/models/Task.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import EscalationEvent from "../src/models/EscalationEvent.js";
import AuditLog from "../src/models/AuditLog.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import { ESCALATION_REASONS } from "../src/enums/escalationReasons.js";
import {
  scheduleTaskEscalations,
  scheduleAckEscalation,
  scheduleActionEscalation,
  getEscalationQueue,
  getFailedEscalationJobs,
  closeEscalationQueue,
} from "../src/queues/escalation.queue.js";
import { processTaskEscalation } from "../src/services/escalationService.js";
import { createEscalationWorker } from "../src/workers/escalation.worker.js";
import { getRedisConfig } from "../src/config/redis.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  clearTestRedis,
  disconnectTestRedis,
  createTestUser,
} from "./setup.js";

describe("Phase 2: Distributed SLA Processing, Queue & Worker Tests", () => {
  let org;
  let admin, member;
  let activeWorkers = [];

  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    for (const w of activeWorkers) {
      await w.close();
    }
    await closeEscalationQueue();
    await disconnectTestRedis();
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    await clearTestRedis();

    org = await Organization.create({ name: "SLA Queue Test Org" });

    const adminFixture = await createTestUser({
      name: "Queue Admin",
      email: "queueadmin@test.com",
      role: "ADMIN",
      orgId: org._id,
    });
    admin = adminFixture.user;

    const memberFixture = await createTestUser({
      name: "Queue Member",
      email: "queuemember@test.com",
      role: "MEMBER",
      orgId: org._id,
    });
    member = memberFixture.user;
  });

  afterEach(async () => {
    for (const w of activeWorkers) {
      await w.close();
    }
    activeWorkers = [];
  });

  describe("Queue Creation & Delayed Job Scheduling", () => {
    it("task creation schedules deterministic ACK and ACTION delayed jobs", async () => {
      const ackDeadline = new Date(Date.now() + 10000);
      const actionDeadline = new Date(Date.now() + 60000);

      const task = await Task.create({
        orgId: org._id,
        title: "Queue Scheduling Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline,
        actionDeadline,
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const { ackJob, actionJob } = await scheduleTaskEscalations(task);

      assert.ok(ackJob);
      assert.ok(actionJob);
      assert.equal(ackJob.id, `ack:${task._id}:1`);
      assert.equal(actionJob.id, `action:${task._id}:1`);
      assert.equal(ackJob.data.taskId, task._id.toString());
      assert.equal(ackJob.data.escalationType, ESCALATION_REASONS.MISSED_ACK);
      assert.equal(actionJob.data.escalationType, ESCALATION_REASONS.MISSED_ACTION);

      // Verify jobs exist in BullMQ queue
      const queue = getEscalationQueue();
      const fetchedAck = await queue.getJob(ackJob.id);
      const fetchedAction = await queue.getJob(actionJob.id);

      assert.ok(fetchedAck);
      assert.ok(fetchedAction);
      assert.equal(fetchedAck.name, ESCALATION_REASONS.MISSED_ACK);
    });

    it("duplicate scheduling with same task and slaVersion does not create duplicate jobs", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Deduplication Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() + 10000),
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const job1 = await scheduleAckEscalation(task);
      const job2 = await scheduleAckEscalation(task);

      assert.equal(job1.id, job2.id);

      const queue = getEscalationQueue();
      const count = await queue.getJobCounts();
      // Should have only 1 delayed job
      assert.equal(count.delayed + count.waiting, 1);
    });
  });

  describe("Worker Behavior & State Transitions", () => {
    it("expired ACK deadline escalates task and creates transition + EscalationEvent records", async () => {
      // Create task with expired ACK deadline
      const task = await Task.create({
        orgId: org._id,
        title: "Expired ACK Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 5000), // 5s ago
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(result.escalated, true);
      assert.equal(result.newState, TASK_STATES.ESCALATED);
      assert.equal(result.newOwner.toString(), admin._id.toString());

      // Verify database updates
      const updatedTask = await Task.findById(task._id);
      assert.equal(updatedTask.state, TASK_STATES.ESCALATED);
      assert.equal(updatedTask.owner.toString(), admin._id.toString());

      // Verify TaskStateTransition created
      const transition = await TaskStateTransition.findOne({ task: task._id });
      assert.ok(transition);
      assert.equal(transition.fromState, TASK_STATES.OPEN);
      assert.equal(transition.toState, TASK_STATES.ESCALATED);
      assert.equal(transition.triggeredBy, "SYSTEM");
      assert.equal(transition.orgId.toString(), org._id.toString());

      // Verify EscalationEvent created
      const event = await EscalationEvent.findOne({ task: task._id });
      assert.ok(event);
      assert.equal(event.escalationType, ESCALATION_REASONS.MISSED_ACK);
      assert.equal(event.previousOwner.toString(), member._id.toString());
      assert.equal(event.newOwner.toString(), admin._id.toString());

      // Verify AuditLog created
      const audit = await AuditLog.findOne({
        orgId: org._id,
        action: "TASK_ESCALATED",
      });
      assert.ok(audit);
    });

    it("expired ACTION deadline escalates an IN_PROGRESS task", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Expired Action Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 10000),
        actionDeadline: new Date(Date.now() - 2000), // expired
        state: TASK_STATES.IN_PROGRESS,
        slaVersion: 1,
      });

      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACTION,
        slaVersion: 1,
      });

      assert.equal(result.escalated, true);
      assert.equal(result.newState, TASK_STATES.ESCALATED);

      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.ESCALATED);
    });

    it("non-expired task is NOT escalated", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Active Future Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() + 60000), // in future
        actionDeadline: new Date(Date.now() + 120000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "ACK_DEADLINE_NOT_REACHED");

      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.OPEN);
    });

    it("completed task is NOT escalated", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Completed Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 10000),
        actionDeadline: new Date(Date.now() - 5000),
        state: TASK_STATES.CLOSED,
        slaVersion: 1,
      });

      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACTION,
        slaVersion: 1,
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "NOT_IN_ACTION_STATE");

      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.CLOSED);
    });

    it("nonexistent task is handled safely as a clean no-op", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const result = await processTaskEscalation({
        taskId: nonExistentId,
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "TASK_NOT_FOUND");
    });

    it("stale job does not incorrectly escalate a reassigned task", async () => {
      // Simulate task that was reassigned, bumping slaVersion to 2
      const task = await Task.create({
        orgId: org._id,
        title: "Reassigned Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 5000), // Old expired deadline
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 2, // Current version is 2
      });

      // An old delayed job with slaVersion: 1 fires now
      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1, // Stale job version!
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "STALE_JOB");

      // Task must remain untouched
      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.OPEN);
      assert.equal(refetched.owner.toString(), member._id.toString());
    });
  });

  describe("Idempotency", () => {
    it("running the same escalation operation twice produces exactly ONE transition", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Idempotent Escalation Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 5000),
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const firstCall = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(firstCall.escalated, true);

      // Second identical execution
      const secondCall = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: org._id.toString(),
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(secondCall.skipped, true);

      // Exactly 1 state transition and 1 escalation event in DB
      const transitions = await TaskStateTransition.find({ task: task._id });
      assert.equal(transitions.length, 1);

      const events = await EscalationEvent.find({ task: task._id });
      assert.equal(events.length, 1);
    });
  });

  describe("Concurrency Safety", () => {
    it("two concurrent workers processing the same task only escalate once", async () => {
      const task = await Task.create({
        orgId: org._id,
        title: "Concurrent Escalation Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 5000),
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      // Simulate 2 parallel workers firing at the exact same moment
      const [res1, res2] = await Promise.all([
        processTaskEscalation({
          taskId: task._id.toString(),
          orgId: org._id.toString(),
          escalationType: ESCALATION_REASONS.MISSED_ACK,
          slaVersion: 1,
        }),
        processTaskEscalation({
          taskId: task._id.toString(),
          orgId: org._id.toString(),
          escalationType: ESCALATION_REASONS.MISSED_ACK,
          slaVersion: 1,
        }),
      ]);

      const escalatedCount = [res1, res2].filter((r) => r.escalated).length;
      const skippedCount = [res1, res2].filter((r) => r.skipped).length;

      assert.equal(escalatedCount, 1, "Exactly one worker must succeed in escalating");
      assert.equal(skippedCount, 1, "The second worker must skip gracefully");

      // Verify no duplicate database side effects
      const transitions = await TaskStateTransition.find({ task: task._id });
      assert.equal(transitions.length, 1);

      const events = await EscalationEvent.find({ task: task._id });
      assert.equal(events.length, 1);
    });
  });

  describe("Tenant Safety in Worker", () => {
    it("rejects escalation when job metadata mismatches task's actual persisted organization", async () => {
      const foreignOrgId = new mongoose.Types.ObjectId().toString();

      const task = await Task.create({
        orgId: org._id,
        title: "Tenant Safety Task",
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(Date.now() - 5000),
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      const result = await processTaskEscalation({
        taskId: task._id.toString(),
        orgId: foreignOrgId, // Wrong organization!
        escalationType: ESCALATION_REASONS.MISSED_ACK,
        slaVersion: 1,
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "TENANT_MISMATCH");

      // Task must remain untouched
      const refetched = await Task.findById(task._id);
      assert.equal(refetched.state, TASK_STATES.OPEN);
    });
  });

  describe("BullMQ Retries & Dead-Letter (DLQ) Handling", () => {
    it("transient failure throws error to trigger BullMQ retries and preserves failed job in DLQ", async () => {
      // Create organization with NO active admin (triggers transient failure)
      const orphanOrg = await Organization.create({ name: "Orphan Org" });

      const task = await Task.create({
        orgId: orphanOrg._id,
        title: "No Admin Task",
        owner: member._id,
        createdBy: member._id,
        ackDeadline: new Date(Date.now() - 5000),
        actionDeadline: new Date(Date.now() + 60000),
        state: TASK_STATES.OPEN,
        slaVersion: 1,
      });

      // Verify processTaskEscalation throws transient error
      await assert.rejects(
        async () => {
          await processTaskEscalation({
            taskId: task._id.toString(),
            orgId: orphanOrg._id.toString(),
            escalationType: ESCALATION_REASONS.MISSED_ACK,
            slaVersion: 1,
          });
        },
        /No active ADMIN found/
      );

      // Now test BullMQ queue retry & failed state
      const queue = getEscalationQueue();
      const job = await queue.add(
        "TEST_RETRY",
        {
          taskId: task._id.toString(),
          orgId: orphanOrg._id.toString(),
          escalationType: ESCALATION_REASONS.MISSED_ACK,
          slaVersion: 1,
        },
        {
          attempts: 1, // Fail immediately for test speed
          removeOnFail: false, // DLQ inspection
        }
      );

      // Spin up test worker to process the job
      const worker = createEscalationWorker({ concurrency: 1 });
      activeWorkers.push(worker);

      // Wait for job to fail
      await new Promise((resolve) => {
        worker.on("failed", (failedJob) => {
          if (failedJob.id === job.id) {
            resolve();
          }
        });
      });

      // Inspect failed jobs (DLQ facility)
      const failedJobs = await getFailedEscalationJobs();
      const ourFailedJob = failedJobs.find((j) => j.id === job.id);

      assert.ok(ourFailedJob, "Failed job must be preserved in failed queue for diagnosis");
      assert.match(
        ourFailedJob.failedReason,
        /No active ADMIN found/,
        "Failed job must store diagnostic error message"
      );
    });
  });

  describe("Redis Configuration & Failure Handling", () => {
    it("getRedisConfig returns required BullMQ settings", () => {
      const config = getRedisConfig();
      assert.equal(config.maxRetriesPerRequest, null);
      assert.equal(config.enableReadyCheck, false);
      assert.ok(config.host);
      assert.ok(config.port);
    });

    it("fails clearly when connecting to invalid Redis port", async () => {
      const IORedis = (await import("ioredis")).default;
      const badRedis = new IORedis({
        host: "127.0.0.1",
        port: 63999, // Non-existent port
        connectTimeout: 500,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Do not retry
      });
      badRedis.on("error", () => {});

      await assert.rejects(async () => {
        await badRedis.ping();
      });

      await badRedis.quit().catch(() => {});
    });
  });
});
