import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { connectTestDB, disconnectTestDB } from "./setup.js";
import {
  recordTaskCreated,
  recordTaskCompleted,
  recordTaskEscalated,
  recordStateTransition,
  register,
} from "../src/metrics/metrics.js";

describe("Prometheus Metrics Endpoint", () => {
  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  test("GET /metrics returns 200 with Prometheus text format", async () => {
    // Trigger some metrics
    recordTaskCreated();
    recordTaskCompleted();
    recordTaskEscalated();
    recordStateTransition("OPEN", "ACKNOWLEDGED", "USER");

    const res = await request(app).get("/metrics");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/plain/);

    const body = res.text;

    // Standard NodeJS runtime metrics
    assert.ok(body.includes("sentinel_process_cpu_user_seconds_total") || body.includes("sentinel_process_cpu_seconds_total"));

    // Business metrics
    assert.ok(body.includes("sentinel_tasks_created_total"));
    assert.ok(body.includes("sentinel_tasks_completed_total"));
    assert.ok(body.includes("sentinel_tasks_escalated_total"));
    assert.ok(body.includes("sentinel_task_state_transitions_total"));

    // SLA & Queue metrics
    assert.ok(body.includes("sentinel_sla_escalations_total"));
    assert.ok(body.includes("sentinel_queue_waiting_jobs"));
    assert.ok(body.includes("sentinel_queue_delayed_jobs"));

    // HTTP metrics
    assert.ok(body.includes("sentinel_http_requests_total"));
    assert.ok(body.includes("sentinel_http_request_duration_seconds"));
  });

  test("metrics do NOT leak sensitive tenant or user identifiers as labels", async () => {
    const res = await request(app).get("/metrics");
    const body = res.text;

    // Verify low-cardinality labels only
    assert.equal(body.includes('userId="'), false);
    assert.equal(body.includes('orgId="'), false);
    assert.equal(body.includes('taskId="'), false);
    assert.equal(body.includes('password='), false);
    assert.equal(body.includes('jwt='), false);
  });
});
