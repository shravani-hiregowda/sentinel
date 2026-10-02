import { Queue } from "bullmq";
import { getRedisConfig } from "../config/redis.js";
import { ESCALATION_REASONS } from "../enums/escalationReasons.js";

export const ESCALATION_QUEUE_NAME = "sla-escalation";

let escalationQueue = null;

/**
 * Returns the singleton BullMQ escalation queue.
 * Configured with exponential retry backoff and preserved failed jobs.
 */
export const getEscalationQueue = () => {
  if (!escalationQueue) {
    const connection = getRedisConfig();
    escalationQueue = new Queue(ESCALATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s, 2s, 4s
        },
        removeOnComplete: {
          count: 500, // Keep last 500 completed jobs for history
        },
        removeOnFail: false, // NEVER remove failed jobs automatically (ensures DLQ auditability)
      },
    });

    escalationQueue.on("error", (err) => {
      console.error("❌ Escalation Queue Error:", err.message);
    });
  }

  return escalationQueue;
};

/**
 * Schedules an ACK deadline delayed escalation job for a task.
 * Deterministic Job ID format: ack:<taskId>:<slaVersion>
 */
export const scheduleAckEscalation = async (task) => {
  if (!task || !task.ackDeadline) return null;

  const queue = getEscalationQueue();
  const now = Date.now();
  const deadlineTime = new Date(task.ackDeadline).getTime();
  const delay = Math.max(0, deadlineTime - now);
  const slaVersion = task.slaVersion || 1;
  const jobId = `ack:${task._id.toString()}:${slaVersion}`;

  const jobData = {
    taskId: task._id.toString(),
    orgId: task.orgId.toString(),
    escalationType: ESCALATION_REASONS.MISSED_ACK,
    slaVersion,
    deadline: task.ackDeadline,
  };

  const job = await queue.add(ESCALATION_REASONS.MISSED_ACK, jobData, {
    jobId,
    delay,
  });

  return job;
};

/**
 * Schedules an ACTION deadline delayed escalation job for a task.
 * Deterministic Job ID format: action:<taskId>:<slaVersion>
 */
export const scheduleActionEscalation = async (task) => {
  if (!task || !task.actionDeadline) return null;

  const queue = getEscalationQueue();
  const now = Date.now();
  const deadlineTime = new Date(task.actionDeadline).getTime();
  const delay = Math.max(0, deadlineTime - now);
  const slaVersion = task.slaVersion || 1;
  const jobId = `action:${task._id.toString()}:${slaVersion}`;

  const jobData = {
    taskId: task._id.toString(),
    orgId: task.orgId.toString(),
    escalationType: ESCALATION_REASONS.MISSED_ACTION,
    slaVersion,
    deadline: task.actionDeadline,
  };

  const job = await queue.add(ESCALATION_REASONS.MISSED_ACTION, jobData, {
    jobId,
    delay,
  });

  return job;
};

/**
 * Schedules all necessary SLA escalation jobs for a newly created or reassigned task.
 */
export const scheduleTaskEscalations = async (task) => {
  const [ackJob, actionJob] = await Promise.all([
    scheduleAckEscalation(task),
    scheduleActionEscalation(task),
  ]);

  return { ackJob, actionJob };
};

/**
 * Retrieves failed escalation jobs for DLQ inspection.
 */
export const getFailedEscalationJobs = async (start = 0, end = 50) => {
  const queue = getEscalationQueue();
  return queue.getFailed(start, end);
};

/**
 * Gracefully closes the escalation queue connection.
 */
export const closeEscalationQueue = async () => {
  if (escalationQueue) {
    await escalationQueue.close();
    escalationQueue = null;
  }
};

export default {
  ESCALATION_QUEUE_NAME,
  getEscalationQueue,
  scheduleAckEscalation,
  scheduleActionEscalation,
  scheduleTaskEscalations,
  getFailedEscalationJobs,
  closeEscalationQueue,
};
