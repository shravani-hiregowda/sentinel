import Task from "../models/Task.js";
import User from "../models/User.js";
import { logStateTransition } from "../services/stateTransition.service.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import { getIo } from "../config/socket.js";
import { sendSMS } from "../services/twilio.service.js";

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

    const admin = req.user;
    const orgId = admin.orgId;

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
      owner: owner._id,
      ackDeadline,
      actionDeadline,
      createdBy: admin._id,
    });

    getIo().emit("task_created", { task });

    if (owner.phone) {
      sendSMS(owner.phone, `Sentinel: You have been assigned a new task: "${task.title}". Please acknowledge by ${new Date(task.ackDeadline).toLocaleString()}.`);
    }

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
};

export const acknowledgeTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;

    // ✅ After JWT integration
    const user = req.user;
    if (!user) {
      const err = new Error("Not authorized");
      err.statusCode = 401;
      throw err;
    }

    const task = await Task.findOne({ _id: taskId, orgId: user.orgId });
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

    if (task.state !== "OPEN") {
      const err = new Error("Task cannot be acknowledged in current state");
      err.statusCode = 409;
      throw err;
    }

    if (new Date() > task.ackDeadline) {
      const err = new Error("ACK deadline missed");
      err.statusCode = 400;
      throw err;
    }

    const previousState = task.state;

    task.state = "ACKNOWLEDGED";
    await task.save();

    await logStateTransition({
      taskId: task._id,
      fromState: previousState,
      toState: "ACKNOWLEDGED",
      triggeredBy: "USER",
      actorId: user._id,
      orgId: user.orgId,
    });

    getIo().emit("task_updated", { task, transition: "ACKNOWLEDGED" });

    res.json({
      success: true,
      message: "Task acknowledged",
      task,
    });
  } catch (error) {
    next(error);
  }
};


export const completeTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;

    const user = req.user;
    if (!user) {
      const err = new Error("Not authorized");
      err.statusCode = 401;
      throw err;
    }

    const task = await Task.findOne({ _id: taskId, orgId: user.orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    // ✅ Only owner can complete
    if (task.owner.toString() !== user._id.toString()) {
      const err = new Error("You are not the task owner");
      err.statusCode = 403;
      throw err;
    }

    // ✅ Only allowed states for completion
    if (!["ACKNOWLEDGED", "IN_PROGRESS"].includes(task.state)) {
      const err = new Error("Task cannot be completed in current state");
      err.statusCode = 409;
      throw err;
    }

    const prevState = task.state;

    // ✅ Close task
    task.state = "CLOSED";
    await task.save();

    // ✅ Log transition
    await logStateTransition({
      taskId: task._id,
      fromState: prevState,
      toState: "CLOSED",
      triggeredBy: "USER",
      actorId: user._id,
      orgId: user.orgId,
    });

    getIo().emit("task_updated", { task, transition: "CLOSED" });

    res.status(200).json({
      success: true,
      message: "Task completed successfully",
      task,
    });
  } catch (error) {
    next(error);
  }
};

export const startTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;

    const user = req.user;
    if (!user) {
      const err = new Error("Not authorized");
      err.statusCode = 401;
      throw err;
    }

    const task = await Task.findOne({ _id: taskId, orgId: user.orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    // Only owner can start
    if (task.owner.toString() !== user._id.toString()) {
      const err = new Error("You are not the task owner");
      err.statusCode = 403;
      throw err;
    }

    // Only allow start from ACKNOWLEDGED state
    if (task.state !== "ACKNOWLEDGED") {
      const err = new Error("Task can only be started after acknowledgment");
      err.statusCode = 409;
      throw err;
    }

    const prevState = task.state;

    task.state = "IN_PROGRESS";
    await task.save();

    await logStateTransition({
      taskId: task._id,
      fromState: prevState,
      toState: "IN_PROGRESS",
      triggeredBy: "USER",
      actorId: user._id,
      orgId: user.orgId,
    });

    getIo().emit("task_updated", { task, transition: "IN_PROGRESS" });

    res.status(200).json({
      success: true,
      message: "Task marked as in progress",
      task,
    });
  } catch (error) {
    next(error);
  }
};

export const getTaskTimeline = async (req, res, next) => {
  try {
    const taskId = req.params.id;

    const task = await Task.findOne({ _id: taskId, orgId: req.user.orgId })
      .populate("owner", "name email role")
      .populate("createdBy", "name email role");

    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    const transitions = await TaskStateTransition.find({ task: taskId, orgId: req.user.orgId })
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

export const getTasksByOwner = async (req, res, next) => {
  try {
    const ownerId = req.params.ownerId;

    // ✅ Only admin or same user can view
    if (req.user.role !== "ADMIN" && req.user._id.toString() !== ownerId) {
      const err = new Error("Forbidden: cannot access other user's tasks");
      err.statusCode = 403;
      throw err;
    }

    const tasks = await Task.find({ owner: ownerId, orgId: req.user.orgId })
      .sort({ updatedAt: -1 })
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

export const getMyTasks = async (req, res, next) => {
  try {
    const userId = req.user.id; // 🔥 FROM JWT
    const orgId = req.user.orgId;

    const tasks = await Task.find({ owner: userId, orgId })
      .populate("owner", "name email")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      tasks,
    });
  } catch (err) {
    next(err);
  }
};


