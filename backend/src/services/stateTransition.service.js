import TaskStateTransition from "../models/TaskStateTransition.js";

export const logStateTransition = async ({
  taskId,
  fromState,
  toState,
  triggeredBy,
  actorId = null,
}) => {
  return TaskStateTransition.create({
    task: taskId,
    fromState,
    toState,
    triggeredBy,
    actor: actorId,
  });
};
