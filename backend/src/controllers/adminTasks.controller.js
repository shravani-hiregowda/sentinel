import Task from "../models/Task.js";
import { transitionTask } from "../services/taskStateMachine.service.js";

/**
 * List tasks for Admin with search, filter, date range, and pagination
 * Strictly scoped to req.orgId
 */
export const listTasksForAdmin = async (req, res, next) => {
  try {
    const {
      q,
      state,
      ownerId,
      overdue,
      page = 1,
      limit = 10,
      startDate,
      endDate,
    } = req.query;

    const orgId = req.orgId;
    const filter = { orgId };

    // Filter by state (can be array or string)
    if (state) {
      if (Array.isArray(state)) filter.state = { $in: state };
      else if (state.includes(",")) filter.state = { $in: state.split(",") };
      else filter.state = state;
    }

    // Filter by owner
    if (ownerId) filter.owner = ownerId;

    // Search by title/description
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    // Overdue only filter
    if (overdue === "true") {
      const now = new Date();
      filter.$or = [
        { state: "OPEN", ackDeadline: { $lt: now } },
        {
          state: { $in: ["ACKNOWLEDGED", "IN_PROGRESS"] },
          actionDeadline: { $lt: now },
        },
      ];
    }

    // Date Range Filtering
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Task.countDocuments(filter);

    const tasks = await Task.find(filter)
      .populate("owner", "name email role")
      .populate("createdBy", "name email role")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      count: tasks.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      tasks,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin update task state
 * Enforces centralized state machine validation and tenant isolation
 */
export const updateTaskStateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { state } = req.body;
    const user = req.user;
    const orgId = req.orgId;

    const task = await Task.findOne({ _id: id, orgId });
    if (!task) {
      const err = new Error("Task not found");
      err.statusCode = 404;
      throw err;
    }

    // Route state transition through centralized state machine
    const { task: updatedTask } = await transitionTask({
      task,
      toState: state,
      actor: user,
      triggeredBy: "ADMIN",
      orgId,
    });

    res.json({ success: true, task: updatedTask });
  } catch (error) {
    next(error);
  }
};
