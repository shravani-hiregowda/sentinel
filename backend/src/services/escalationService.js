import Task from "../models/Task.js";
import User from "../models/User.js";
import EscalationEvent from "../models/EscalationEvent.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import AuditLog from "../models/AuditLog.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { ROLES } from "../enums/roles.js";
import { ESCALATION_REASONS } from "../enums/escalationReasons.js";
import { getIo } from "../config/socket.js";
import logger from "../utils/logger.js";
import {
  recordSlaEscalation,
  recordSlaEscalationFailure,
  recordStaleJob,
  recordNoopEscalation,
  recordTaskEscalated,
} from "../metrics/metrics.js";
import { invalidateDashboardCache } from "./cache.service.js";

/**
 * Centrally processes an SLA escalation job for a single task.
 *
 * Guarantees:
 * 1. Tenant Safety: Task's persisted orgId is the authoritative source.
 * 2. Stale Job Protection: Ignores jobs matching old slaVersions or superseded deadlines.
 * 3. Idempotency: Safe to execute repeatedly without duplicate transitions or side effects.
 * 4. Concurrency Safety: Atomic conditional MongoDB update prevents race conditions across workers.
 * 5. Full Auditability: Generates TaskStateTransition, EscalationEvent, and AuditLog records.
 *
 * @param {Object} jobData
 * @param {string} jobData.taskId - Target task ID
 * @param {string} jobData.orgId - Expected tenant ID
 * @param {string} jobData.escalationType - "MISSED_ACK" or "MISSED_ACTION"
 * @param {number} jobData.slaVersion - SLA version at time of job creation
 * @returns {Promise<Object>} Result summary
 */
export const processTaskEscalation = async ({
  taskId,
  orgId,
  escalationType,
  slaVersion,
}) => {
  if (!taskId) {
    recordNoopEscalation();
    return { skipped: true, reason: "MISSING_TASK_ID" };
  }

  // 1. Load task by ID (source of truth)
  const task = await Task.findById(taskId);
  if (!task) {
    logger.warn(`Task ${taskId} not found for escalation. Cleanly skipping.`, {
      event: "sla.noop",
      taskId,
      reason: "TASK_NOT_FOUND",
    });
    recordNoopEscalation();
    return { skipped: true, reason: "TASK_NOT_FOUND" };
  }

  // 2. Tenant isolation check: Persisted task organization is authoritative
  if (orgId && task.orgId.toString() !== orgId.toString()) {
    logger.error(
      `Tenant mismatch: Task ${taskId} belongs to ${task.orgId}, but job specified ${orgId}. Rejecting.`,
      {
        event: "sla.tenant_mismatch",
        taskId,
        taskOrgId: task.orgId.toString(),
        jobOrgId: orgId.toString(),
      }
    );
    recordSlaEscalationFailure(escalationType, "TENANT_MISMATCH");
    return { skipped: true, reason: "TENANT_MISMATCH" };
  }

  // 3. Stale Job Protection: Compare slaVersion
  if (slaVersion !== undefined && task.slaVersion !== slaVersion) {
    logger.info(
      `Stale job ignored for Task ${taskId}: Job slaVersion (${slaVersion}) !== Task slaVersion (${task.slaVersion}).`,
      {
        event: "sla.stale_job",
        taskId: task._id.toString(),
        orgId: task.orgId.toString(),
        jobVersion: slaVersion,
        taskVersion: task.slaVersion,
      }
    );
    recordStaleJob();
    return {
      skipped: true,
      reason: "STALE_JOB",
      taskVersion: task.slaVersion,
      jobVersion: slaVersion,
    };
  }


  const now = new Date();

  // 4. State eligibility and deadline expiration checks
  let eligibleStates = [];

  if (escalationType === ESCALATION_REASONS.MISSED_ACK) {
    if (task.state !== TASK_STATES.OPEN) {
      return {
        skipped: true,
        reason: "NOT_IN_OPEN_STATE",
        currentState: task.state,
      };
    }

    if (now < new Date(task.ackDeadline)) {
      return {
        skipped: true,
        reason: "ACK_DEADLINE_NOT_REACHED",
        deadline: task.ackDeadline,
      };
    }

    eligibleStates = [TASK_STATES.OPEN];
  } else if (escalationType === ESCALATION_REASONS.MISSED_ACTION) {
    if (![TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS].includes(task.state)) {
      return {
        skipped: true,
        reason: "NOT_IN_ACTION_STATE",
        currentState: task.state,
      };
    }

    if (now < new Date(task.actionDeadline)) {
      return {
        skipped: true,
        reason: "ACTION_DEADLINE_NOT_REACHED",
        deadline: task.actionDeadline,
      };
    }

    eligibleStates = [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS];
  } else {
    return { skipped: true, reason: "UNKNOWN_ESCALATION_TYPE" };
  }

  // 5. Find an active ADMIN for this tenant to reassign the escalated task to
  const admin = await User.findOne({
    orgId: task.orgId,
    role: ROLES.ADMIN,
    isActive: true,
  });

  if (!admin) {
    const errorMsg = `No active ADMIN found for org ${task.orgId} to accept escalated task ${taskId}`;
    console.error(`❌ [Escalation Worker] ${errorMsg}`);
    // Transient business error: throw so BullMQ retries with backoff
    throw new Error(errorMsg);
  }

  // 6. Atomic Concurrency Lock: Atomically verify state & transition
  // If multiple workers process this task concurrently, only ONE will match state in eligibleStates
  const updatedTask = await Task.findOneAndUpdate(
    {
      _id: task._id,
      orgId: task.orgId,
      state: { $in: eligibleStates },
      slaVersion: task.slaVersion,
    },
    {
      $set: {
        state: TASK_STATES.ESCALATED,
        owner: admin._id,
      },
    },
    { new: false } // returns document prior to update
  );

  // If null, another worker won the race or task changed state concurrently
  if (!updatedTask) {
    logger.info(
      `Task ${taskId} was already transitioned concurrently or previously. Skipping idempotent escalation.`,
      {
        event: "sla.noop",
        taskId: task._id.toString(),
        orgId: task.orgId.toString(),
        reason: "ALREADY_TRANSITIONED",
      }
    );
    recordNoopEscalation();
    return { skipped: true, reason: "ALREADY_TRANSITIONED" };
  }

  const previousState = updatedTask.state;
  const previousOwner = updatedTask.owner;

  // 7. Audit & Event Records (Immutable history)
  await Promise.all([
    // State transition history
    TaskStateTransition.create({
      orgId: task.orgId,
      task: task._id,
      fromState: previousState,
      toState: TASK_STATES.ESCALATED,
      triggeredBy: "SYSTEM",
      actor: null,
    }),

    // Dedicated EscalationEvent record
    EscalationEvent.create({
      orgId: task.orgId,
      task: task._id,
      escalationType,
      previousOwner,
      newOwner: admin._id,
      previousState,
      reason: escalationType,
      triggeredBy: "SYSTEM",
    }),

    // Enterprise security audit log
    AuditLog.create({
      orgId: task.orgId,
      userId: null,
      action: "TASK_ESCALATED",
      meta: {
        taskId: task._id,
        escalationType,
        previousState,
        previousOwner,
        newOwner: admin._id,
      },
    }),
  ]);

  // Record metrics
  try {
    recordSlaEscalation(escalationType);
    recordTaskEscalated();
  } catch {
    // Metrics should not interrupt transaction
  }

  // Invalidate tenant dashboard cache
  try {
    await invalidateDashboardCache(task.orgId);
  } catch {
    // Cache invalidation failure should not abort escalation
  }

  logger.info(`Task ${taskId} successfully escalated (${escalationType}) to Admin ${admin._id}`, {
    event: "sla.escalated",
    taskId: task._id.toString(),
    orgId: task.orgId.toString(),
    escalationType,
    previousState,
    newOwner: admin._id.toString(),
  });

  // 8. Real-time notification emission
  try {
    const io = getIo();
    if (io) {
      io.emit("task_escalated", {
        taskId: task._id,
        task: {
          ...task.toObject(),
          state: TASK_STATES.ESCALATED,
          owner: admin._id,
        },
        escalationType,
      });
    }
  } catch {
    // Socket emit optional
  }


  console.log(
    `✅ [Escalation Worker] Task ${taskId} successfully escalated (${escalationType}) to Admin ${admin._id}`
  );

  return {
    escalated: true,
    taskId: task._id,
    previousState,
    newState: TASK_STATES.ESCALATED,
    newOwner: admin._id,
  };
};

/**
 * Legacy batch escalation for missed ACK (preserved for backward compatibility & testing)
 */
export const escalateMissedAckTasks = async () => {
  const now = new Date();
  const tasks = await Task.find({
    state: TASK_STATES.OPEN,
    ackDeadline: { $lt: now },
  });

  let escalatedCount = 0;
  for (const t of tasks) {
    const result = await processTaskEscalation({
      taskId: t._id,
      orgId: t.orgId,
      escalationType: ESCALATION_REASONS.MISSED_ACK,
      slaVersion: t.slaVersion,
    });
    if (result.escalated) escalatedCount++;
  }
  return { escalatedCount };
};

/**
 * Legacy batch escalation for missed Action (preserved for backward compatibility & testing)
 */
export const escalateMissedActionTasks = async () => {
  const now = new Date();
  const tasks = await Task.find({
    state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
    actionDeadline: { $lt: now },
  });

  let escalatedCount = 0;
  for (const t of tasks) {
    const result = await processTaskEscalation({
      taskId: t._id,
      orgId: t.orgId,
      escalationType: ESCALATION_REASONS.MISSED_ACTION,
      slaVersion: t.slaVersion,
    });
    if (result.escalated) escalatedCount++;
  }
  return { escalatedCount };
};

export default {
  processTaskEscalation,
  escalateMissedAckTasks,
  escalateMissedActionTasks,
};
