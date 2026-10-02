import TaskStateTransition from "../models/TaskStateTransition.js";
import { VALID_TRANSITIONS, TASK_STATES } from "../enums/taskStates.js";
import { getIo } from "../config/socket.js";
import logger from "../utils/logger.js";
import {
  recordStateTransition,
  recordTaskCompleted,
  recordTaskEscalated,
} from "../metrics/metrics.js";
import { invalidateDashboardCache } from "./cache.service.js";

/**
 * Checks whether a transition between two states is valid.
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export const canTransition = (fromState, toState) => {
  if (!fromState || !toState) return false;
  if (!VALID_TRANSITIONS[fromState]) return false;
  return VALID_TRANSITIONS[fromState].includes(toState);
};

/**
 * Validates a transition between two states.
 * Throws an Error with statusCode 409 (Conflict) if invalid.
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export const validateTransition = (fromState, toState) => {
  if (!canTransition(fromState, toState)) {
    const error = new Error(
      `Cannot transition task from state '${fromState}' to '${toState}'. Invalid transition.`
    );
    error.statusCode = 409;
    throw error;
  }
  return true;
};

/**
 * Centrally transitions a task from its current state to a new state.
 *
 * Enforces:
 * 1. Central transition validation (HTTP 409 on invalid transition)
 * 2. Tenant isolation verification (HTTP 404 if task doesn't belong to org)
 * 3. Immutable audit trail logging via TaskStateTransition
 * 4. Real-time notification emission via Socket.io
 * 5. Observability: records Prometheus metrics and emits structured logs
 *
 * @param {Object} params
 * @param {import("mongoose").Document} params.task - The Mongoose task document
 * @param {string} params.toState - The target state
 * @param {string|Object|null} [params.actor] - User ID or User document triggering the transition
 * @param {string} [params.triggeredBy="USER"] - "USER", "ADMIN", or "SYSTEM"
 * @param {string} [params.orgId] - Verified tenant ID for isolation validation
 * @param {Function} [params.beforeSave] - Optional hook to modify other fields before save
 * @param {Object} [params.metadata] - Optional metadata for future audit expansion
 * @returns {Promise<{ task: Object, transition: Object }>}
 */
export const transitionTask = async ({
  task,
  toState,
  actor = null,
  triggeredBy = "USER",
  orgId,
  beforeSave = null,
  _metadata = {},
}) => {
  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  // Tenant isolation check
  if (orgId && task.orgId.toString() !== orgId.toString()) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  const fromState = task.state;

  // Validate state machine rule
  validateTransition(fromState, toState);

  // Apply state change
  task.state = toState;

  // Execute optional pre-save adjustments (e.g., owner reassignment or deadline update)
  if (typeof beforeSave === "function") {
    await beforeSave(task);
  }

  await task.save();

  const actorId = actor ? (actor._id || actor) : null;

  // Record audit transition
  const transition = await TaskStateTransition.create({
    orgId: task.orgId,
    task: task._id,
    fromState,
    toState,
    triggeredBy,
    actor: actorId,
  });

  // Record metrics
  try {
    recordStateTransition(fromState, toState, triggeredBy);
    if (toState === TASK_STATES.CLOSED) {
      recordTaskCompleted();
    } else if (toState === TASK_STATES.ESCALATED) {
      recordTaskEscalated();
    }
  } catch {
    // Metric recording should never abort business logic
  }

  // Invalidate tenant-scoped dashboard cache on state transition
  try {
    await invalidateDashboardCache(task.orgId);
  } catch {
    // Cache invalidation failure should not abort a valid database transition
  }

  // Structured event log
  logger.info("Task state transitioned", {
    event: "task.transition",
    taskId: task._id.toString(),
    orgId: task.orgId.toString(),
    fromState,
    toState,
    triggeredBy,
  });

  // Emit real-time notification
  try {
    const io = getIo();
    if (io) {
      io.emit("task_updated", { task, transition: toState });
    }
  } catch {
    // Socket emit failure should not abort a valid database transition
  }

  return { task, transition };
};

