import Task from "../models/Task.js";
import User from "../models/User.js";
import { logStateTransition } from "../services/stateTransition.service.js";
import { sendSMS } from "../services/twilio.service.js";

export const reassignTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { newOwnerId, ownerId, newAckDeadline, newActionDeadline } = req.body;
    const targetOwnerId = newOwnerId || ownerId;

    // ✅ Get admin from req.user
    const adminId = req.user._id;
    const orgId = req.user.orgId;

    // ✅ Find task in the same org
    const task = await Task.findOne({ _id: taskId, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    // ✅ Admins can reassign tasks from any state.
    // If we wanted to restrict to ESCALATED only, we would do it here.

    // ✅ Find new owner in the same org
    const newOwner = await User.findOne({ _id: targetOwnerId, orgId });
    if (!newOwner || !newOwner.isActive) {
      const err = new Error("Invalid new owner");
      err.statusCode = 400;
      throw err;
    }

    const prevState = task.state;

    // ✅ Reassign and reset state
    task.owner = newOwner._id;
    task.state = "OPEN"; // new owner must ACK again

    // ✅ Deadline refresh rules
    const now = new Date();

    // If admin provides deadlines, use them
    if (newAckDeadline) {
    task.ackDeadline = new Date(newAckDeadline);
    } else {
    // Otherwise auto-set ACK deadline to 1 hour from now
    task.ackDeadline = new Date(now.getTime() + 60 * 60 * 1000);
    }

    if (newActionDeadline) {
    task.actionDeadline = new Date(newActionDeadline);
    } else {
    // Otherwise auto-set Action deadline to 24 hours from now
    task.actionDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    await task.save();

    // ✅ Log transition as USER action by admin
    await logStateTransition({
      taskId: task._id,
      fromState: prevState,
      toState: "OPEN",
      triggeredBy: "USER",
      actorId: adminId,
      orgId: orgId,
    });

    if (newOwner.phone) {
      sendSMS(newOwner.phone, `Sentinel: You have been reassigned a task: "${task.title}". Please acknowledge by ${task.ackDeadline.toLocaleString()}.`);
    }

    res.status(200).json({
      success: true,
      message: "Task reassigned successfully",
      task,
    });
  } catch (error) {
    next(error);
  }
};
