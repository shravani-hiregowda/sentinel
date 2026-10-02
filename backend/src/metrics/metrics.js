import client from "prom-client";

// Initialize Prometheus registry
export const register = new client.Registry();

// Collect default NodeJS runtime metrics (memory, event loop, CPU, etc.)
client.collectDefaultMetrics({
  register,
  prefix: "sentinel_",
});

/* ---------------- HTTP METRICS ---------------- */

export const httpRequestsTotal = new client.Counter({
  name: "sentinel_http_requests_total",
  help: "Total count of HTTP requests handled by Sentinel API",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: "sentinel_http_request_duration_seconds",
  help: "Histogram of HTTP request durations in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpActiveRequests = new client.Gauge({
  name: "sentinel_http_active_requests",
  help: "Number of currently active in-flight HTTP requests",
  registers: [register],
});

/* ---------------- CACHE METRICS ---------------- */

export const cacheHitsTotal = new client.Counter({
  name: "sentinel_cache_hits_total",
  help: "Total count of tenant cache hits",
  labelNames: ["resource"],
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: "sentinel_cache_misses_total",
  help: "Total count of tenant cache misses",
  labelNames: ["resource"],
  registers: [register],
});

/* ---------------- BUSINESS METRICS ---------------- */

export const tasksCreatedTotal = new client.Counter({
  name: "sentinel_tasks_created_total",
  help: "Total count of governance tasks created",
  registers: [register],
});

export const tasksCompletedTotal = new client.Counter({
  name: "sentinel_tasks_completed_total",
  help: "Total count of governance tasks successfully closed/completed",
  registers: [register],
});

export const tasksEscalatedTotal = new client.Counter({
  name: "sentinel_tasks_escalated_total",
  help: "Total count of tasks that entered ESCALATED state",
  registers: [register],
});

export const taskStateTransitionsTotal = new client.Counter({
  name: "sentinel_task_state_transitions_total",
  help: "Total count of task state machine transitions",
  labelNames: ["from_state", "to_state", "triggered_by"],
  registers: [register],
});

/* ---------------- SLA & QUEUE METRICS ---------------- */

export const slaEscalationsTotal = new client.Counter({
  name: "sentinel_sla_escalations_total",
  help: "Total SLA escalations processed",
  labelNames: ["type"],
  registers: [register],
});

export const slaEscalationFailuresTotal = new client.Counter({
  name: "sentinel_sla_escalation_failures_total",
  help: "Total SLA escalations that failed processing",
  labelNames: ["type", "reason"],
  registers: [register],
});

export const slaStaleJobsTotal = new client.Counter({
  name: "sentinel_sla_stale_jobs_total",
  help: "Total SLA escalation jobs discarded due to stale slaVersion",
  registers: [register],
});

export const slaNoopEscalationsTotal = new client.Counter({
  name: "sentinel_sla_noop_escalations_total",
  help: "Total SLA escalation jobs that were skipped as idempotent no-ops",
  registers: [register],
});

/* ---------------- WORKER METRICS ---------------- */

export const workerJobsProcessedTotal = new client.Counter({
  name: "sentinel_worker_jobs_processed_total",
  help: "Total BullMQ jobs processed by worker",
  labelNames: ["queue", "status"],
  registers: [register],
});

export const workerJobsFailedTotal = new client.Counter({
  name: "sentinel_worker_jobs_failed_total",
  help: "Total BullMQ jobs that permanently failed",
  labelNames: ["queue"],
  registers: [register],
});

export const workerJobDurationSeconds = new client.Histogram({
  name: "sentinel_worker_job_duration_seconds",
  help: "Histogram of worker job execution times in seconds",
  labelNames: ["queue"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/* ---------------- QUEUE GAUGES ---------------- */

export const queueWaitingJobs = new client.Gauge({
  name: "sentinel_queue_waiting_jobs",
  help: "Number of waiting jobs in BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});

export const queueActiveJobs = new client.Gauge({
  name: "sentinel_queue_active_jobs",
  help: "Number of currently active jobs in BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});

export const queueCompletedJobs = new client.Gauge({
  name: "sentinel_queue_completed_jobs",
  help: "Number of completed jobs stored in BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});

export const queueFailedJobs = new client.Gauge({
  name: "sentinel_queue_failed_jobs",
  help: "Number of failed jobs stored in BullMQ queue (DLQ)",
  labelNames: ["queue"],
  registers: [register],
});

export const queueDelayedJobs = new client.Gauge({
  name: "sentinel_queue_delayed_jobs",
  help: "Number of delayed SLA jobs waiting for deadline trigger",
  labelNames: ["queue"],
  registers: [register],
});

/* ---------------- HELPER FUNCTIONS ---------------- */

export const recordHttpRequest = (method, route, statusCode, durationSec) => {
  const normRoute = route || "unmatched";
  const strStatus = String(statusCode);
  httpRequestsTotal.inc({ method, route: normRoute, status_code: strStatus });
  httpRequestDurationSeconds.observe({ method, route: normRoute, status_code: strStatus }, durationSec);
};

export const recordTaskCreated = () => {
  tasksCreatedTotal.inc();
};

export const recordTaskCompleted = () => {
  tasksCompletedTotal.inc();
};

export const recordTaskEscalated = () => {
  tasksEscalatedTotal.inc();
};

export const recordStateTransition = (fromState, toState, triggeredBy) => {
  taskStateTransitionsTotal.inc({
    from_state: fromState,
    to_state: toState,
    triggered_by: triggeredBy || "UNKNOWN",
  });
};

export const recordSlaEscalation = (type) => {
  slaEscalationsTotal.inc({ type: type || "UNKNOWN" });
};

export const recordSlaEscalationFailure = (type, reason) => {
  slaEscalationFailuresTotal.inc({
    type: type || "UNKNOWN",
    reason: reason || "UNKNOWN",
  });
};

export const recordStaleJob = () => {
  slaStaleJobsTotal.inc();
};

export const recordNoopEscalation = () => {
  slaNoopEscalationsTotal.inc();
};

export const recordWorkerJob = (queue, status, durationSec) => {
  workerJobsProcessedTotal.inc({ queue, status });
  if (durationSec !== undefined) {
    workerJobDurationSeconds.observe({ queue }, durationSec);
  }
};

export const recordWorkerJobFailure = (queue) => {
  workerJobsFailedTotal.inc({ queue });
};

/**
 * Dynamically queries BullMQ queue job counts and updates gauges.
 */
export const updateQueueMetrics = async (queue) => {
  if (!queue) return;
  try {
    const queueName = queue.name || "unknown";
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );

    queueWaitingJobs.set({ queue: queueName }, counts.waiting || 0);
    queueActiveJobs.set({ queue: queueName }, counts.active || 0);
    queueCompletedJobs.set({ queue: queueName }, counts.completed || 0);
    queueFailedJobs.set({ queue: queueName }, counts.failed || 0);
    queueDelayedJobs.set({ queue: queueName }, counts.delayed || 0);
  } catch {
    // Fail silently so metrics scrape doesn't fail
  }
};

export const recordCacheHit = (resource = "default") => {
  cacheHitsTotal.inc({ resource });
};

export const recordCacheMiss = (resource = "default") => {
  cacheMissesTotal.inc({ resource });
};

export default {
  register,
  recordHttpRequest,
  recordCacheHit,
  recordCacheMiss,
  recordTaskCreated,
  recordTaskCompleted,
  recordTaskEscalated,
  recordStateTransition,
  recordSlaEscalation,
  recordSlaEscalationFailure,
  recordStaleJob,
  recordNoopEscalation,
  recordWorkerJob,
  recordWorkerJobFailure,
  updateQueueMetrics,
};
