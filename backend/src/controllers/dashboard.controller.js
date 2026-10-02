import Task from "../models/Task.js";
import User from "../models/User.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import { TASK_STATES } from "../enums/taskStates.js";
import {
  getTenantCache,
  setTenantCache,
} from "../services/cache.service.js";

const DASHBOARD_CACHE_TTL_SEC = 60; // 60s sensible TTL with explicit event-driven invalidation

/**
 * Get dashboard summary metrics for the tenant.
 * Uses tenant-isolated Redis cache with DB fallback.
 * Queries MongoDB in parallel using indexed compound counts.
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const orgId = req.orgId;

    // 1. Check tenant cache
    const cacheKey = "dashboard:summary";
    const cachedSummary = await getTenantCache(orgId, cacheKey);
    if (cachedSummary) {
      return res.json({
        success: true,
        summary: cachedSummary,
        source: "cache",
      });
    }

    // 2. Fetch metrics concurrently in parallel via Promise.all
    const now = new Date();
    const [
      open,
      acknowledged,
      inProgress,
      escalated,
      closed,
      overdueAck,
      overdueAction,
    ] = await Promise.all([
      Task.countDocuments({ orgId, state: TASK_STATES.OPEN }),
      Task.countDocuments({ orgId, state: TASK_STATES.ACKNOWLEDGED }),
      Task.countDocuments({ orgId, state: TASK_STATES.IN_PROGRESS }),
      Task.countDocuments({ orgId, state: TASK_STATES.ESCALATED }),
      Task.countDocuments({ orgId, state: TASK_STATES.CLOSED }),
      Task.countDocuments({
        orgId,
        state: TASK_STATES.OPEN,
        ackDeadline: { $lt: now },
      }),
      Task.countDocuments({
        orgId,
        state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
        actionDeadline: { $lt: now },
      }),
    ]);

    const summary = {
      open,
      acknowledged,
      inProgress,
      escalated,
      closed,
      overdueAck,
      overdueAction,
    };

    // 3. Populate tenant cache
    await setTenantCache(orgId, cacheKey, summary, DASHBOARD_CACHE_TTL_SEC);

    res.json({
      success: true,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get escalated tasks for tenant with safe pagination/bounding.
 */
export const getEscalatedTasks = async (req, res, next) => {
  try {
    const orgId = req.orgId;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

    const tasks = await Task.find({ orgId, state: TASK_STATES.ESCALATED })
      .populate("owner", "name email role")
      .populate("createdBy", "name email role")
      .sort({ updatedAt: -1 })
      .limit(limit);

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
 * Get overdue tasks for tenant with bounded limits.
 */
export const getOverdueTasks = async (req, res, next) => {
  try {
    const orgId = req.orgId;
    const now = new Date();
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

    const [missedAck, missedAction] = await Promise.all([
      Task.find({
        orgId,
        state: TASK_STATES.OPEN,
        ackDeadline: { $lt: now },
      })
        .populate("owner", "name email")
        .limit(limit),
      Task.find({
        orgId,
        state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
        actionDeadline: { $lt: now },
      })
        .populate("owner", "name email")
        .limit(limit),
    ]);

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

/**
 * Get member performance report.
 * Resolves N+1 query problem by replacing 3N+1 queries with a single aggregation
 * and caching the tenant report in Redis.
 */
export const getMemberPerformance = async (req, res, next) => {
  try {
    const orgId = req.orgId;

    // 1. Check tenant cache
    const cacheKey = "dashboard:member-performance";
    const cachedReport = await getTenantCache(orgId, cacheKey);
    if (cachedReport) {
      return res.json({
        success: true,
        report: cachedReport,
        source: "cache",
      });
    }

    // 2. Fetch active members for tenant (Query 1)
    const members = await User.find({ orgId, role: "MEMBER", isActive: true })
      .select("name email")
      .lean();

    // 3. Batch aggregate all member task stats in a single query (Query 2)
    const taskStats = await Task.aggregate([
      { $match: { orgId } },
      {
        $group: {
          _id: "$owner",
          totalAssigned: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$state", TASK_STATES.CLOSED] }, 1, 0] },
          },
          escalationsCaused: {
            $sum: { $cond: [{ $eq: ["$state", TASK_STATES.ESCALATED] }, 1, 0] },
          },
        },
      },
    ]);

    // 4. Map stats in-memory in O(M) time
    const statsMap = new Map();
    for (const stat of taskStats) {
      if (stat._id) {
        statsMap.set(stat._id.toString(), stat);
      }
    }

    const report = members.map((member) => {
      const memberIdStr = member._id.toString();
      const stat = statsMap.get(memberIdStr) || {
        totalAssigned: 0,
        completed: 0,
        escalationsCaused: 0,
      };

      const completionRate =
        stat.totalAssigned === 0
          ? 0
          : Math.round((stat.completed / stat.totalAssigned) * 100);

      return {
        member: {
          id: member._id,
          name: member.name,
          email: member.email,
        },
        totalAssigned: stat.totalAssigned,
        completed: stat.completed,
        escalationsCaused: stat.escalationsCaused,
        completionRate,
      };
    });

    // Sort by best performers
    report.sort((a, b) => b.completionRate - a.completionRate);

    // 5. Store in tenant cache
    await setTenantCache(orgId, cacheKey, report, DASHBOARD_CACHE_TTL_SEC);

    res.json({
      success: true,
      report,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get tenant activity feed with bounded limits.
 */
export const getActivityFeed = async (req, res, next) => {
  try {
    const orgId = req.orgId;
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

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