import Task from "../models/Task.js";
import User from "../models/User.js";
import TaskStateTransition from "../models/TaskStateTransition.js";

export const getDashboardSummary = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();

    const open = await Task.countDocuments({ orgId, state: "OPEN" });
    const acknowledged = await Task.countDocuments({ orgId, state: "ACKNOWLEDGED" });
    const inProgress = await Task.countDocuments({ orgId, state: "IN_PROGRESS" });
    const escalated = await Task.countDocuments({ orgId, state: "ESCALATED" });
    const closed = await Task.countDocuments({ orgId, state: "CLOSED" });

    const overdueAck = await Task.countDocuments({
      orgId,
      state: "OPEN",
      ackDeadline: { $lt: now },
    });

    const overdueAction = await Task.countDocuments({
      orgId,
      state: { $in: ["ACKNOWLEDGED", "IN_PROGRESS"] },
      actionDeadline: { $lt: now },
    });

    res.json({
      success: true,
      summary: {
        open,
        acknowledged,
        inProgress,
        escalated,
        closed,
        overdueAck,
        overdueAction,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getEscalatedTasks = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const tasks = await Task.find({ orgId, state: "ESCALATED" })
      .populate("owner", "name email role")
      .populate("createdBy", "name email role")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    next(err);
  }
};

export const getOverdueTasks = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const now = new Date();

    const missedAck = await Task.find({
      orgId,
      state: "OPEN",
      ackDeadline: { $lt: now },
    }).populate("owner", "name email");

    const missedAction = await Task.find({
      orgId,
      state: { $in: ["ACKNOWLEDGED", "IN_PROGRESS"] },
      actionDeadline: { $lt: now },
    }).populate("owner", "name email");

    res.json({
      success: true,
      overdue: {
        missedAck,
        missedAction,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getMemberPerformance = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    // total assigned per member
    const members = await User.find({ orgId, role: "MEMBER", isActive: true });

    const report = [];

    for (const member of members) {
      const totalAssigned = await Task.countDocuments({ orgId, owner: member._id });
      const completed = await Task.countDocuments({
        orgId,
        owner: member._id,
        state: "CLOSED",
      });
      const escalationsCaused = await Task.countDocuments({
        orgId,
        owner: member._id,
        state: "ESCALATED",
      });

      const completionRate =
        totalAssigned === 0 ? 0 : Math.round((completed / totalAssigned) * 100);

      report.push({
        member: {
          id: member._id,
          name: member.name,
          email: member.email,
        },
        totalAssigned,
        completed,
        escalationsCaused,
        completionRate,
      });
    }

    // Sort by best performers
    report.sort((a, b) => b.completionRate - a.completionRate);

    res.json({
      success: true,
      report,
    });
  } catch (err) {
    next(err);
  }
};

export const getActivityFeed = async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    const limit = parseInt(req.query.limit || "20", 10);

    const feed = await TaskStateTransition.find({ orgId })
      .populate("task", "title state")
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: feed.length,
      feed,
    });
  } catch (err) {
    next(err);
  }
};