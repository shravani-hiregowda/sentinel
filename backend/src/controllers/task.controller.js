import Task from "../models/Task.js";
import User from "../models/User.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import { transitionTask } from "../services/taskStateMachine.service.js";
import { scheduleTaskEscalations } from "../queues/escalation.queue.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { getIo } from "../config/socket.js";
import { sendSMS } from "../services/twilio.service.js";
import { recordTaskCreated } from "../metrics/metrics.js";
import { invalidateDashboardCache } from "../services/cache.service.js";


/**
 * Create a new task (Admin only)
 * Initial state defaults to TASK_STATES.OPEN
 */
export const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      ownerId,
      ackDeadline,
      actionDeadline,
    } = req.body;

    if (req.user.role !== "ADMIN") {
      const err = new Error("Only admin can create tasks");
      err.statusCode = 403;
      throw err;
    }

    const orgId = req.orgId;

    const owner = await User.findOne({ _id: ownerId, orgId });
    if (!owner || !owner.isActive) {
      const err = new Error("Invalid task owner in your organization");
      err.statusCode = 400;
      throw err;
    }

    const task = await Task.create({
      orgId,
      title,
      description,
      state: TASK_STATES.OPEN, // Explicit initial state
      owner: owner._id,
      ackDeadline,
      actionDeadline,
      createdBy: req.user._id,
    });

    try {
      const io = getIo();
      if (io) {
        io.to(`org:${orgId.toString()}`).emit("task_created", { task });
        io.emit("task_created", { task });
      }
    } catch {
      // Socket optional
    }

    // Invalidate tenant dashboard cache
    try {
      await invalidateDashboardCache(orgId);
    } catch {
      // Cache invalidation failure should not abort task creation
    }

    // Schedule BullMQ SLA escalation delayed jobs (ACK & Action)
    await scheduleTaskEscalations(task);

    // Record business metric & structured log
    try {
      recordTaskCreated();
    } catch {
      // Non-blocking
    }

    if (req.logger) {
      req.logger.info("Task successfully created", {
        event: "task.created",
        taskId: task._id.toString(),
        orgId: orgId.toString(),
        ownerId: owner._id.toString(),
      });
    }

    if (owner.phone) {
      sendSMS(
        owner.phone,
        `Sentinel: You have been assigned a new task: "${task.title}". Please acknowledge by ${new Date(task.ackDeadline).toLocaleString()}.`
      );
    }

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }

};

/**
 * Acknowledge a task (Owner only)
 * Transitions: OPEN -> ACKNOWLEDGED
 */
export const acknowledgeTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const user = req.user;
    const orgId = req.orgId;

    const task = await Task.findOne({ _id: taskId, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    if (task.owner.toString() !== user._id.toString()) {
      const err = new Error("You are not the task owner");
      err.statusCode = 403;
      throw err;
    }

    if (new Date() > task.ackDeadline) {
      const err = new Error("ACK deadline missed");
      err.statusCode = 400;
      throw err;
    }

    // Centrally managed state machine transition
    const { task: updatedTask } = await transitionTask({
      task,
      toState: TASK_STATES.ACKNOWLEDGED,
      actor: user,
      triggeredBy: "USER",
      orgId,
    });

    res.json({
      success: true,
      message: "Task acknowledged",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Start working on a task (Owner only)
 * Transitions: ACKNOWLEDGED -> IN_PROGRESS
 */
export const startTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const user = req.user;
    const orgId = req.orgId;

    const task = await Task.findOne({ _id: taskId, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    if (task.owner.toString() !== user._id.toString()) {
      const err = new Error("You are not the task owner");
      err.statusCode = 403;
      throw err;
    }

    // Centrally managed state machine transition
    const { task: updatedTask } = await transitionTask({
      task,
      toState: TASK_STATES.IN_PROGRESS,
      actor: user,
      triggeredBy: "USER",
      orgId,
    });

    res.status(200).json({
      success: true,
      message: "Task marked as in progress",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete a task (Owner only)
 * Transitions: ACKNOWLEDGED | IN_PROGRESS -> CLOSED
 */
export const completeTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const user = req.user;
    const orgId = req.orgId;

    const task = await Task.findOne({ _id: taskId, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    if (task.owner.toString() !== user._id.toString()) {
      const err = new Error("You are not the task owner");
      err.statusCode = 403;
      throw err;
    }

    // Centrally managed state machine transition
    const { task: updatedTask } = await transitionTask({
      task,
      toState: TASK_STATES.CLOSED,
      actor: user,
      triggeredBy: "USER",
      orgId,
    });

    res.status(200).json({
      success: true,
      message: "Task completed successfully",
      task: updatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get audit timeline for a task
 */
export const getTaskTimeline = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const orgId = req.orgId;

    const task = await Task.findOne({ _id: taskId, orgId })
      .populate("owner", "name email role")
      .populate("createdBy", "name email role");

    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    const transitions = await TaskStateTransition.find({ task: taskId, orgId })
      .populate("actor", "name email role")
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      task,
      transitions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get tasks assigned to a specific owner
 */
export const getTasksByOwner = async (req, res, next) => {
  try {
    const ownerId = req.params.ownerId;
    const orgId = req.orgId;

    // Authorization: only admin or the user themselves can view
    if (req.user.role !== "ADMIN" && req.user._id.toString() !== ownerId) {
      const err = new Error("Forbidden: cannot access other user's tasks");
      err.statusCode = 403;
      throw err;
    }

    // Verify owner belongs to same tenant
    const targetOwner = await User.findOne({ _id: ownerId, orgId });
    if (!targetOwner) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const skip = (page - 1) * limit;

    const tasks = await Task.find({ owner: ownerId, orgId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("owner", "name email role")
      .populate("createdBy", "name email role");

    res.json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get tasks assigned to the currently authenticated user
 */
export const getMyTasks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const orgId = req.orgId;

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const skip = (page - 1) * limit;

    const tasks = await Task.find({ owner: userId, orgId })
      .populate("owner", "name email")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      tasks,
    });
  } catch (err) {
    next(err);
  }
};
