import Task from "../models/Task.js";
import User from "../models/User.js";
import { transitionTask } from "../services/taskStateMachine.service.js";
import { scheduleTaskEscalations } from "../queues/escalation.queue.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { sendSMS } from "../services/twilio.service.js";

/**
 * Admin reassign task to a new owner
 * Resets state to OPEN via centralized state machine
 */
export const reassignTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { newOwnerId, ownerId, newAckDeadline, newActionDeadline } = req.body;
    const targetOwnerId = newOwnerId || ownerId;

    const admin = req.user;
    const orgId = req.orgId;

    // Find task in the same tenant
    const task = await Task.findOne({ _id: taskId, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    if (task.state === TASK_STATES.CLOSED) {
      const err = new Error("Cannot reassign a closed task");
      err.statusCode = 409;
      throw err;
    }

    // Find new owner in the same tenant
    const newOwner = await User.findOne({ _id: targetOwnerId, orgId });
    if (!newOwner || !newOwner.isActive) {
      const err = new Error("Invalid new owner");
      err.statusCode = 400;
      throw err;
    }

    // Deadline refresh rules
    const now = new Date();
    const ackDeadline = newAckDeadline
      ? new Date(newAckDeadline)
      : new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    const actionDeadline = newActionDeadline
      ? new Date(newActionDeadline)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Transition task to OPEN and update owner/deadlines atomically through centralized state machine
    const { task: updatedTask } = await transitionTask({
      task,
      toState: TASK_STATES.OPEN,
      actor: admin,
      triggeredBy: "ADMIN",
      orgId,
      beforeSave: (t) => {
        t.owner = newOwner._id;
        t.ackDeadline = ackDeadline;
        t.actionDeadline = actionDeadline;
        t.slaVersion = (t.slaVersion || 1) + 1; // Bump slaVersion to invalidate previous delayed jobs
      },
    });

    // Schedule new delayed SLA escalation jobs with updated slaVersion
    await scheduleTaskEscalations(updatedTask);

    if (newOwner.phone) {
      sendSMS(
        newOwner.phone,
        `Sentinel: You have been reassigned a task: "${updatedTask.title}". Please acknowledge by ${updatedTask.ackDeadline.toLocaleString()}.`
      );
    }

    res.status(200).json({
      success: true,
      message: "Task reassigned successfully",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};
