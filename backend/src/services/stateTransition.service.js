import TaskStateTransition from "../models/TaskStateTransition.js";

/**
 * Audit log recording for state transitions.
 * Preserved for backward compatibility.
 */
export const logStateTransition = async ({
  taskId,
  fromState,
  toState,
  triggeredBy,
  actorId = null,
  orgId,
}) => {
  return TaskStateTransition.create({
    orgId,
    task: taskId,
    fromState,
    toState,
    triggeredBy,
    actor: actorId,
  });
};
