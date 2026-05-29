import Task from "../models/Task.js";
import User from "../models/User.js";
import { logStateTransition } from "./stateTransition.service.js";
import { getIo } from "../config/socket.js";

export const escalateMissedAckTasks = async () => {
  const now = new Date();

  const tasksToEscalate = await Task.find({
    state: "OPEN",
    ackDeadline: { $lt: now },
  });

  if (!tasksToEscalate.length) return { escalatedCount: 0 };

  let escalatedCount = 0;

  for (const task of tasksToEscalate) {
    const admin = await User.findOne({ orgId: task.orgId, role: "ADMIN", isActive: true });
    if (!admin) {
      console.error(`❌ Cannot escalate task ${task._id}: No active ADMIN found for org ${task.orgId}`);
      continue;
    }

    const previousState = task.state;
    const previousOwner = task.owner;

    task.state = "ESCALATED";
    task.owner = admin._id;
    await task.save();

    await logStateTransition({
      taskId: task._id,
      fromState: previousState,
      toState: "ESCALATED",
      triggeredBy: "SYSTEM",
      actorId: null,
      orgId: task.orgId,
    });

    try { getIo().emit("task_escalated", { task }); } catch (e) { console.error("Socket emit failed", e); }
    escalatedCount++;
  }

  return { escalatedCount };
};


export const escalateMissedActionTasks = async () => {
  const now = new Date();

  const tasksToEscalate = await Task.find({
    state: { $in: ["ACKNOWLEDGED", "IN_PROGRESS"] },
    actionDeadline: { $lt: now },
  });

  if (!tasksToEscalate.length) return { escalatedCount: 0 };

  let escalatedCount = 0;

  for (const task of tasksToEscalate) {
    const admin = await User.findOne({ orgId: task.orgId, role: "ADMIN", isActive: true });
    if (!admin) {
      console.error(`❌ Cannot escalate task ${task._id}: No active ADMIN found for org ${task.orgId}`);
      continue;
    }

    const previousState = task.state;
    const previousOwner = task.owner;

    task.state = "ESCALATED";
    task.owner = admin._id;
    await task.save();

    await logStateTransition({
      taskId: task._id,
      fromState: previousState,
      toState: "ESCALATED",
      triggeredBy: "SYSTEM",
      actorId: null,
      orgId: task.orgId,
    });

    try { getIo().emit("task_escalated", { task }); } catch (e) { console.error("Socket emit failed", e); }
    escalatedCount++;
  }

  return { escalatedCount };
};
