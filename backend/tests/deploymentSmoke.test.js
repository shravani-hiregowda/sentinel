import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import http from "http";
import { io as Client } from "socket.io-client";
import app from "../src/app.js";
import { initSocket } from "../src/config/socket.js";
import {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  createTestUser,
  clearTestRedis,
  disconnectTestRedis,
} from "./setup.js";
import { connectRedis, closeRedis } from "../src/config/redis.js";
import { TASK_STATES } from "../src/enums/taskStates.js";
import { ROLES } from "../src/enums/roles.js";
import { ESCALATION_REASONS } from "../src/enums/escalationReasons.js";
import Task from "../src/models/Task.js";
import EscalationEvent from "../src/models/EscalationEvent.js";
import { createEscalationWorker } from "../src/workers/escalation.worker.js";
import { scheduleAckEscalation, closeEscalationQueue } from "../src/queues/escalation.queue.js";

describe("Deployment Smoke Test Suite (Production Readiness)", () => {
  let server;
  let io;
  let port;
  let testAdmin;
  let testOrgId;
  let worker;

  before(async () => {
    await connectTestDB();
    await connectRedis();
    await clearTestDB();
    await clearTestRedis();

    testOrgId = new mongoose.Types.ObjectId();
    testAdmin = await createTestUser({
      name: "Smoke Test Admin",
      email: `admin-smoke-${Date.now()}@example.com`,
      role: ROLES.ADMIN,
      orgId: testOrgId,
    });

    // Start HTTP server with Socket.io for end-to-end smoke verification
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    // Start SLA Worker instance
    worker = createEscalationWorker({ concurrency: 2 });
  });

  after(async () => {
    if (worker) {
      await worker.close();
    }
    await closeEscalationQueue();
    if (io) {
      await new Promise((resolve) => io.close(resolve));
    }
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectTestRedis();
    await disconnectTestDB();
  });

  it("1. Health Endpoint (/health) returns 200 with service metadata", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "sentinel-api");
    assert.ok(res.body.uptime >= 0);
  });

  it("2. Readiness Endpoint (/ready) validates MongoDB and Redis connectivity", async () => {
    const res = await request(app).get("/ready");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ready");
    assert.equal(res.body.checks.mongodb.status, "up");
    assert.equal(res.body.checks.redis.status, "up");
  });

  it("3. Prometheus Metrics Endpoint (/metrics) is exposed and functional", async () => {
    const res = await request(app).get("/metrics");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("sentinel_http_requests_total"));
  });

  it("4. Authentication and Member Flow works end-to-end", async () => {
    const res = await request(app)
      .post("/api/users/create-member")
      .set("Authorization", `Bearer ${testAdmin.token}`)
      .send({
        name: "Smoke Member",
        email: `member-smoke-${Date.now()}@example.com`,
        password: "Password123!",
        role: ROLES.MEMBER,
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.user.id);
    assert.equal(res.body.user.role, ROLES.MEMBER);
  });

  it("5. Task Lifecycle: Creation, Retrieval, and State Transition", async () => {
    // A. Create Task
    const now = Date.now();
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${testAdmin.token}`)
      .send({
        title: "Smoke Lifecycle Task",
        description: "Validating full CRUD lifecycle",
        ownerId: testAdmin.user._id.toString(),
        ackDeadline: new Date(now + 60000).toISOString(),
        actionDeadline: new Date(now + 120000).toISOString(),
      });

    assert.equal(createRes.status, 201);
    const taskId = createRes.body.task._id;
    assert.ok(taskId);
    assert.equal(createRes.body.task.state, TASK_STATES.OPEN);

    // B. Retrieve Task Timeline
    const timelineRes = await request(app)
      .get(`/api/tasks/${taskId}/timeline`)
      .set("Authorization", `Bearer ${testAdmin.token}`);

    assert.equal(timelineRes.status, 200);
    assert.equal(timelineRes.body.task.title, "Smoke Lifecycle Task");

    // C. Retrieve My Tasks
    const myTasksRes = await request(app)
      .get("/api/tasks/my")
      .set("Authorization", `Bearer ${testAdmin.token}`);

    assert.equal(myTasksRes.status, 200);
    assert.ok(Array.isArray(myTasksRes.body.tasks));

    // D. State Transition (Ack)
    const ackRes = await request(app)
      .post(`/api/tasks/${taskId}/ack`)
      .set("Authorization", `Bearer ${testAdmin.token}`);

    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.body.task.state, TASK_STATES.ACKNOWLEDGED);
  });

  it("6. BullMQ SLA Escalation Worker processes jobs end-to-end", async () => {
    const pastDate = new Date(Date.now() - 5000); // 5 seconds past due
    const task = await Task.create({
      orgId: testOrgId,
      owner: testAdmin.user._id,
      createdBy: testAdmin.user._id,
      title: "SLA Overdue Smoke Task",
      state: TASK_STATES.OPEN,
      ackDeadline: pastDate,
      actionDeadline: new Date(Date.now() + 60000),
    });

    // Schedule BullMQ job with past-due deadline (runs immediately)
    await scheduleAckEscalation(task);

    // Poll until worker executes escalation
    let escalated = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const updated = await Task.findById(task._id);
      if (updated.state === TASK_STATES.ESCALATED) {
        escalated = true;
        break;
      }
    }

    assert.ok(escalated, "Worker failed to escalate overdue task");

    const event = await EscalationEvent.findOne({ task: task._id });
    assert.ok(event, "EscalationEvent must be created by worker");
    assert.equal(event.reason, ESCALATION_REASONS.MISSED_ACK);
  });

  it("7. Socket.IO real-time connection and room handshake", async () => {
    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: testAdmin.token },
      transports: ["websocket"],
      forceNew: true,
    });

    const connected = await new Promise((resolve) => {
      clientSocket.on("connect", () => resolve(true));
      clientSocket.on("connect_error", (err) => {
        console.warn("Socket connect error:", err.message);
        resolve(false);
      });
      setTimeout(() => resolve(false), 3000);
    });

    clientSocket.disconnect();
    assert.ok(connected, "Socket.IO client should successfully connect");
  });
});
