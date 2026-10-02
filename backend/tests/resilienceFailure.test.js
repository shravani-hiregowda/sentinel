import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
  clearTestRedis,
  disconnectTestRedis,
} from "./setup.js";
import { connectRedis, closeRedis, getRedisConnection } from "../src/config/redis.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import { ROLES } from "../src/enums/roles.js";
import Task from "../src/models/Task.js";
import EscalationEvent from "../src/models/EscalationEvent.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import { createEscalationWorker } from "../src/workers/escalation.worker.js";
import { scheduleAckEscalation, closeEscalationQueue } from "../src/queues/escalation.queue.js";

describe("Operational Resilience & Failure Recovery Tests (Phase 5)", () => {
  let testAdmin;
  let testOrgId;

  before(async () => {
    await connectTestDB();
    await connectRedis();
    await clearTestDB();
    await clearTestRedis();

    testOrgId = new mongoose.Types.ObjectId();
    testAdmin = await createTestUser({
      name: "Resilience Admin",
      email: `resilience-admin-${Date.now()}@example.com`,
      role: ROLES.ADMIN,
      orgId: testOrgId,
    });
  });

  after(async () => {
    await closeEscalationQueue();
    await disconnectTestRedis();
    await disconnectTestDB();
  });

  it("1. Redis Outage Resilience: Liveness stays UP (200), Readiness reports NOT_READY (503)", async () => {
    const redisClient = getRedisConnection();
    const originalPing = redisClient.ping;

    // Simulate Redis network partition / failure
    redisClient.ping = async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:6379");
    };

    try {
      // Liveness must remain 200 (Node process is alive)
      const healthRes = await request(app).get("/health");
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.body.status, "ok");

      // Readiness must report 503 and down
      const readyRes = await request(app).get("/ready");
      assert.equal(readyRes.status, 503);
      assert.equal(readyRes.body.status, "not_ready");
      assert.equal(readyRes.body.checks.redis.status, "down");
      assert.ok(readyRes.body.checks.redis.error.includes("ECONNREFUSED"));
    } finally {
      // Restore Redis connection
      redisClient.ping = originalPing;
    }

    // Verify recovery after restoration
    const recoveredRes = await request(app).get("/ready");
    assert.equal(recoveredRes.status, 200);
    assert.equal(recoveredRes.body.checks.redis.status, "up");
  });

  it("2. MongoDB Outage Resilience: Readiness fails (503) and does NOT falsely report READY", async () => {
    // Simulate MongoDB connection loss via readyState
    const originalReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 0, // Disconnected
      configurable: true,
      writable: true,
    });

    try {
      const res = await request(app).get("/ready");
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "not_ready");
      assert.equal(res.body.checks.mongodb.status, "down");
    } finally {
      // Restore MongoDB state
      Object.defineProperty(mongoose.connection, "readyState", {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    }

    // Verify recovery
    const recoveredRes = await request(app).get("/ready");
    assert.equal(recoveredRes.status, 200);
    assert.equal(recoveredRes.body.checks.mongodb.status, "up");
  });

  it("3. Worker Offline Resilience: API queues tasks, worker restart processes backlog safely", async () => {
    // A. Create task when no worker is running
    const task = await Task.create({
      orgId: testOrgId,
      owner: testAdmin.user._id,
      createdBy: testAdmin.user._id,
      title: "Worker Offline Backlog Task",
      state: TASK_STATES.OPEN,
      ackDeadline: new Date(Date.now() - 5000), // Overdue
      actionDeadline: new Date(Date.now() + 60000),
    });

    // Queue the job
    await scheduleAckEscalation(task);

    // Verify task is still OPEN while worker is stopped
    await new Promise((r) => setTimeout(r, 200));
    const stillOpen = await Task.findById(task._id);
    assert.equal(stillOpen.state, TASK_STATES.OPEN);

    // B. Start worker to process queued backlog
    const worker = createEscalationWorker({ concurrency: 2 });
    try {
      let escalated = false;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const updated = await Task.findById(task._id);
        if (updated.state === TASK_STATES.ESCALATED) {
          escalated = true;
          break;
        }
      }
      assert.ok(escalated, "Worker failed to drain queued backlog upon startup");
    } finally {
      await worker.close();
    }
  });

  it("4. Worker Restart Idempotency: Restarting worker does NOT duplicate transitions or escalations", async () => {
    const task = await Task.create({
      orgId: testOrgId,
      owner: testAdmin.user._id,
      createdBy: testAdmin.user._id,
      title: "Idempotent Escalation Task",
      state: TASK_STATES.OPEN,
      ackDeadline: new Date(Date.now() - 5000),
      actionDeadline: new Date(Date.now() + 60000),
    });

    // 1st Worker run
    const worker1 = createEscalationWorker({ concurrency: 1 });
    await scheduleAckEscalation(task);

    let processed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const t = await Task.findById(task._id);
      if (t.state === TASK_STATES.ESCALATED) {
        processed = true;
        break;
      }
    }
    assert.ok(processed, "First worker run must escalate task");
    await worker1.close();

    // Verify initial counts
    const initialTransitions = await TaskStateTransition.countDocuments({ task: task._id });
    const initialEvents = await EscalationEvent.countDocuments({ task: task._id });
    assert.equal(initialTransitions, 1);
    assert.equal(initialEvents, 1);

    // 2nd Worker restart: Reschedule and process identical job
    const worker2 = createEscalationWorker({ concurrency: 1 });
    try {
      await scheduleAckEscalation(task);
      // Give worker time to encounter the duplicate
      await new Promise((r) => setTimeout(r, 300));

      const finalTransitions = await TaskStateTransition.countDocuments({ task: task._id });
      const finalEvents = await EscalationEvent.countDocuments({ task: task._id });

      assert.equal(finalTransitions, 1, "Idempotency violated: duplicate state transition found");
      assert.equal(finalEvents, 1, "Idempotency violated: duplicate escalation event found");
    } finally {
      await worker2.close();
    }
  });
});
