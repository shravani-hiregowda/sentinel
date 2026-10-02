export const TASK_STATES = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  IN_PROGRESS: "IN_PROGRESS",
  BLOCKED: "BLOCKED",
  ESCALATED: "ESCALATED",
  CLOSED: "CLOSED",
});

/**
 * Single source of truth for valid task state transitions.
 * - OPEN -> ACKNOWLEDGED, ESCALATED, OPEN (reassignment)
 * - ACKNOWLEDGED -> IN_PROGRESS, CLOSED, ESCALATED, BLOCKED, OPEN (reassignment)
 * - IN_PROGRESS -> CLOSED, BLOCKED, ESCALATED, OPEN (reassignment)
 * - BLOCKED -> IN_PROGRESS, CLOSED, ESCALATED, OPEN (reassignment)
 * - ESCALATED -> OPEN (admin reassign), IN_PROGRESS, CLOSED
 * - CLOSED -> [] (terminal state; closed tasks cannot be reopened or transitioned)
 */
export const VALID_TRANSITIONS = Object.freeze({
  [TASK_STATES.OPEN]: Object.freeze([
    TASK_STATES.OPEN,
    TASK_STATES.ACKNOWLEDGED,
    TASK_STATES.ESCALATED,
  ]),
  [TASK_STATES.ACKNOWLEDGED]: Object.freeze([
    TASK_STATES.OPEN,
    TASK_STATES.IN_PROGRESS,
    TASK_STATES.CLOSED,
    TASK_STATES.ESCALATED,
    TASK_STATES.BLOCKED,
  ]),
  [TASK_STATES.IN_PROGRESS]: Object.freeze([
    TASK_STATES.OPEN,
    TASK_STATES.CLOSED,
    TASK_STATES.BLOCKED,
    TASK_STATES.ESCALATED,
  ]),
  [TASK_STATES.BLOCKED]: Object.freeze([
    TASK_STATES.OPEN,
    TASK_STATES.IN_PROGRESS,
    TASK_STATES.CLOSED,
    TASK_STATES.ESCALATED,
  ]),
  [TASK_STATES.ESCALATED]: Object.freeze([
    TASK_STATES.OPEN,
    TASK_STATES.IN_PROGRESS,
    TASK_STATES.CLOSED,
  ]),
  [TASK_STATES.CLOSED]: Object.freeze([]),
});
