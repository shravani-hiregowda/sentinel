import mongoose from "mongoose";
import Task from "../models/Task.js";
import User from "../models/User.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import EscalationEvent from "../models/EscalationEvent.js";
import AuditLog from "../models/AuditLog.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { ROLES } from "../enums/roles.js";
import { transitionTask } from "./taskStateMachine.service.js";
import { scheduleTaskEscalations } from "../queues/escalation.queue.js";
import { invalidateDashboardCache } from "./cache.service.js";
import { getIo } from "../config/socket.js";
import {
  recordTaskCreated,
  recordAiToolCall,
  recordAiToolFailure,
} from "../metrics/metrics.js";
import logger from "../utils/logger.js";

/**
 * OpenAI / IBM watsonx standard tool definitions.
 * Only this allowlisted set of functions can be invoked by the AI layer.
 */
export const AI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "getTasks",
      description: "Retrieve a list of governance tasks for the caller's organization. Supports optional state filtering.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED", "CLOSED"],
            description: "Optional task lifecycle state to filter by.",
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return (1-50, default 20).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getOverdueTasks",
      description: "Retrieve tasks in the caller's organization that have breached their ACK deadline or action deadline.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum tasks to return per overdue category (default 20).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getEscalatedTasks",
      description: "Retrieve all tasks currently in ESCALATED state for the caller's organization, including escalation reasons.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of escalated tasks to return (default 20).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTaskDetails",
      description: "Get detailed status, deadlines, and ownership for a specific task by its ID or title snippet.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "MongoDB ObjectId of the task or exact title snippet.",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTaskSLAHistory",
      description: "Get the chronological SLA timeline, state transitions, and escalation events for a task to understand why it escalated or its lifecycle.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "MongoDB ObjectId of the task.",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTeamPerformance",
      description: "Get team member SLA performance metrics, completion rates, and escalations caused across the organization.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createTask",
      description: "Create a new governance task within the organization with explicit SLA deadlines. ADMIN role required.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the governance task (max 200 chars).",
          },
          description: {
            type: "string",
            description: "Description or requirements for the task.",
          },
          ownerEmailOrName: {
            type: "string",
            description: "Email address or full name of the active organization member to assign the task to.",
          },
          ackHours: {
            type: "number",
            description: "Allowed acknowledgment window in hours (default: 4 hours).",
          },
          actionHours: {
            type: "number",
            description: "Allowed resolution/action window in hours (default: 24 hours).",
          },
        },
        required: ["title", "ownerEmailOrName"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "acknowledgeTask",
      description: "Acknowledge an assigned OPEN task. Only the assigned task owner (or admin) can acknowledge.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "MongoDB ObjectId of the task to acknowledge.",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Execute an allowlisted Sentinel AI operation within a strict security context.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. ctx.orgId is derived solely from verified req.user.orgId — never from user prompt or AI arguments.
 * 2. Every database query enforces { orgId: ctx.orgId } ensuring strict multi-tenant isolation.
 * 3. RBAC checks are verified before any privileged action is executed.
 * 4. State transitions must pass through the centralized taskStateMachine.service.js.
 * 5. All write operations create immutable AuditLog entries.
 *
 * @param {string} toolName
 * @param {Object} args
 * @param {Object} ctx
 * @param {import("mongoose").Types.ObjectId} ctx.orgId
 * @param {Object} ctx.user
 * @param {string} ctx.requestId
 * @returns {Promise<Object>}
 */
export const executeAiTool = async (toolName, args = {}, ctx = {}) => {
  const { orgId, user, requestId } = ctx;

  if (!orgId) {
    recordAiToolFailure(toolName, "MISSING_TENANT_CONTEXT");
    throw new Error("Missing tenant context for tool execution");
  }

  if (!user) {
    recordAiToolFailure(toolName, "UNAUTHENTICATED");
    throw new Error("Authentication required for tool execution");
  }

  logger.info("Executing AI allowlisted tool", {
    event: "ai.tool.execute",
    toolName,
    orgId: orgId.toString(),
    userId: user._id.toString(),
    userRole: user.role,
    requestId,
  });

  try {
    let result;

    switch (toolName) {
      /* -------------------------------------------------------------
       * TOOL 1: getTasks
       * ----------------------------------------------------------- */
      case "getTasks": {
        const limit = Math.min(Math.max(parseInt(args.limit || 20, 10), 1), 50);
        const query = { orgId };

        if (args.state && Object.values(TASK_STATES).includes(args.state.toUpperCase())) {
          query.state = args.state.toUpperCase();
        }

        const tasks = await Task.find(query)
          .populate("owner", "name email role")
          .populate("createdBy", "name email")
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean();

        result = {
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            state: t.state,
            owner: t.owner ? { name: t.owner.name, email: t.owner.email } : null,
            ackDeadline: t.ackDeadline,
            actionDeadline: t.actionDeadline,
            updatedAt: t.updatedAt,
          })),
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 2: getOverdueTasks
       * ----------------------------------------------------------- */
      case "getOverdueTasks": {
        const now = new Date();
        const limit = Math.min(Math.max(parseInt(args.limit || 20, 10), 1), 50);

        const [missedAck, missedAction] = await Promise.all([
          Task.find({
            orgId,
            state: TASK_STATES.OPEN,
            ackDeadline: { $lt: now },
          })
            .populate("owner", "name email")
            .limit(limit)
            .lean(),
          Task.find({
            orgId,
            state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
            actionDeadline: { $lt: now },
          })
            .populate("owner", "name email")
            .limit(limit)
            .lean(),
        ]);

        result = {
          totalOverdue: missedAck.length + missedAction.length,
          missedAcknowledgment: missedAck.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            state: t.state,
            owner: t.owner ? t.owner.name : "Unassigned",
            ackDeadline: t.ackDeadline,
          })),
          missedResolution: missedAction.map((t) => ({
            id: t._id.toString(),
            title: t.title,
            state: t.state,
            owner: t.owner ? t.owner.name : "Unassigned",
            actionDeadline: t.actionDeadline,
          })),
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 3: getEscalatedTasks
       * ----------------------------------------------------------- */
      case "getEscalatedTasks": {
        const limit = Math.min(Math.max(parseInt(args.limit || 20, 10), 1), 50);

        const tasks = await Task.find({ orgId, state: TASK_STATES.ESCALATED })
          .populate("owner", "name email")
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean();

        // Attach latest escalation event details
        const enriched = await Promise.all(
          tasks.map(async (t) => {
            const event = await EscalationEvent.findOne({
              orgId,
              $or: [{ task: t._id }, { taskId: t._id }],
            })
              .sort({ createdAt: -1 })
              .lean();
            return {
              id: t._id.toString(),
              title: t.title,
              owner: t.owner ? t.owner.name : "Unassigned",
              escalatedAt: t.updatedAt,
              reason: event ? (event.escalationType || event.reason) : "SLA_BREACH",
              notes: event ? (event.reason || event.notes || "Escalated due to SLA breach") : "Escalated by Sentinel automated worker",
            };
          })
        );

        result = {
          count: enriched.length,
          escalatedTasks: enriched,
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 4: getTaskDetails
       * ----------------------------------------------------------- */
      case "getTaskDetails": {
        const { taskId } = args;
        if (!taskId) {
          throw new Error("taskId parameter is required");
        }

        let task = null;
        if (mongoose.Types.ObjectId.isValid(taskId)) {
          task = await Task.findOne({ _id: taskId, orgId })
            .populate("owner", "name email role")
            .populate("createdBy", "name email role")
            .lean();
        }

        // If not found by ID, attempt match by title
        if (!task) {
          task = await Task.findOne({
            orgId,
            title: { $regex: taskId.trim(), $options: "i" },
          })
            .populate("owner", "name email role")
            .populate("createdBy", "name email role")
            .lean();
        }

        if (!task) {
          result = { found: false, message: `No task matching '${taskId}' found in your organization.` };
          break;
        }

        result = {
          found: true,
          task: {
            id: task._id.toString(),
            title: task.title,
            description: task.description,
            state: task.state,
            owner: task.owner ? { name: task.owner.name, email: task.owner.email } : null,
            createdBy: task.createdBy ? { name: task.createdBy.name, email: task.createdBy.email } : null,
            ackDeadline: task.ackDeadline,
            actionDeadline: task.actionDeadline,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          },
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 5: getTaskSLAHistory
       * ----------------------------------------------------------- */
      case "getTaskSLAHistory": {
        const { taskId } = args;
        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
          throw new Error("A valid MongoDB ObjectId is required for getTaskSLAHistory");
        }

        const task = await Task.findOne({ _id: taskId, orgId }).lean();
        if (!task) {
          result = { found: false, message: "Task not found in your organization." };
          break;
        }

        const [transitions, escalations] = await Promise.all([
          TaskStateTransition.find({ orgId, $or: [{ task: taskId }, { taskId }] })
            .populate("actor", "name email role")
            .sort({ createdAt: 1 })
            .lean(),
          EscalationEvent.find({ orgId, $or: [{ task: taskId }, { taskId }] })
            .sort({ createdAt: 1 })
            .lean(),
        ]);

        result = {
          found: true,
          task: {
            id: task._id.toString(),
            title: task.title,
            state: task.state,
            ackDeadline: task.ackDeadline,
            actionDeadline: task.actionDeadline,
          },
          timeline: transitions.map((tr) => ({
            fromState: tr.fromState,
            toState: tr.toState,
            triggeredBy: tr.triggeredBy,
            actor: tr.actor ? tr.actor.name : tr.triggeredBy,
            timestamp: tr.createdAt,
          })),
          escalations: escalations.map((e) => ({
            reason: e.escalationType || e.reason,
            fromState: e.previousState || e.fromState,
            toState: TASK_STATES.ESCALATED,
            notes: e.reason || e.notes || "Escalated by Sentinel",
            timestamp: e.createdAt,
          })),
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 6: getTeamPerformance
       * ----------------------------------------------------------- */
      case "getTeamPerformance": {
        const members = await User.find({ orgId, role: ROLES.MEMBER, isActive: true })
          .select("name email")
          .lean();

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
              currentlyOpen: {
                $sum: { $cond: [{ $in: ["$state", [TASK_STATES.OPEN, TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS]] }, 1, 0] },
              },
            },
          },
        ]);

        const statsMap = new Map();
        for (const s of taskStats) {
          if (s._id) statsMap.set(s._id.toString(), s);
        }

        const report = members.map((m) => {
          const s = statsMap.get(m._id.toString()) || {
            totalAssigned: 0,
            completed: 0,
            escalationsCaused: 0,
            currentlyOpen: 0,
          };
          const completionRate = s.totalAssigned === 0 ? 0 : Math.round((s.completed / s.totalAssigned) * 100);

          return {
            name: m.name,
            email: m.email,
            totalAssigned: s.totalAssigned,
            completed: s.completed,
            escalationsCaused: s.escalationsCaused,
            currentlyOpen: s.currentlyOpen,
            completionRate: `${completionRate}%`,
          };
        });

        result = {
          totalMembers: members.length,
          memberPerformance: report,
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 7: createTask (ADMIN Only)
       * ----------------------------------------------------------- */
      case "createTask": {
        // Strict RBAC check
        if (user.role !== ROLES.ADMIN) {
          recordAiToolFailure(toolName, "FORBIDDEN_NOT_ADMIN");
          return {
            success: false,
            error: "Forbidden: Only users with the ADMIN role are authorized to create tasks.",
          };
        }

        const { title, description, ownerEmailOrName, ackHours = 4, actionHours = 24 } = args;

        if (!title || !title.trim()) {
          throw new Error("Task title is required");
        }

        if (!ownerEmailOrName || !ownerEmailOrName.trim()) {
          throw new Error("ownerEmailOrName is required to assign the task");
        }

        // Locate owner exclusively within the tenant
        const trimmedOwner = ownerEmailOrName.trim();
        const ownerQuery = {
          orgId,
          isActive: true,
          $or: [
            { email: { $regex: `^${trimmedOwner}$`, $options: "i" } },
            { name: { $regex: trimmedOwner, $options: "i" } },
          ],
        };

        if (mongoose.Types.ObjectId.isValid(trimmedOwner)) {
          ownerQuery.$or.push({ _id: trimmedOwner });
        }

        const owner = await User.findOne(ownerQuery);
        if (!owner) {
          const available = await User.find({ orgId, isActive: true }).select("name email").limit(5).lean();
          return {
            success: false,
            error: `Member '${ownerEmailOrName}' not found in your organization. Available members: ${available.map((a) => `${a.name} (${a.email})`).join(", ")}`,
          };
        }

        const now = Date.now();
        const safeAckHours = Math.max(0.5, Math.min(Number(ackHours) || 4, 168)); // 30m to 7 days
        const safeActionHours = Math.max(safeAckHours + 0.5, Math.min(Number(actionHours) || 24, 720)); // Up to 30 days

        const ackDeadline = new Date(now + safeAckHours * 3600 * 1000);
        const actionDeadline = new Date(now + safeActionHours * 3600 * 1000);

        const task = await Task.create({
          orgId,
          title: title.trim(),
          description: description ? description.trim() : "Created via Sentinel AI Assistant",
          state: TASK_STATES.OPEN,
          owner: owner._id,
          ackDeadline,
          actionDeadline,
          createdBy: user._id,
        });

        // BullMQ escalation jobs scheduling (bounded by 500ms timeout for resilience)
        try {
          if (process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_QUEUE === "true") {
            await Promise.race([
              scheduleTaskEscalations(task),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Queue timeout")), 500)),
            ]);
          }
        } catch (queueErr) {
          logger.warn("Escalation queue unavailable for AI task creation", { error: queueErr.message });
        }

        // Realtime notification
        try {
          const io = getIo();
          if (io) {
            io.to(`org:${orgId.toString()}`).emit("task_created", { task });
          }
        } catch {
          // Socket optional
        }

        // Invalidate tenant cache
        try {
          await invalidateDashboardCache(orgId);
        } catch {
          // Non-blocking
        }

        // Metrics & Audit
        try {
          recordTaskCreated();
          await AuditLog.create({
            orgId,
            userId: user._id,
            action: "AI_CREATE_TASK",
            meta: {
              taskId: task._id,
              title: task.title,
              ownerId: owner._id,
              ownerEmail: owner.email,
              ackDeadline,
              actionDeadline,
              tool: "createTask",
            },
          });
        } catch (auditErr) {
          logger.warn("Non-blocking audit log failure in AI createTask", { error: auditErr.message });
        }

        result = {
          success: true,
          message: `Task '${task.title}' created successfully and assigned to ${owner.name}.`,
          task: {
            id: task._id.toString(),
            title: task.title,
            state: task.state,
            owner: owner.name,
            ackDeadline,
            actionDeadline,
          },
        };
        break;
      }

      /* -------------------------------------------------------------
       * TOOL 8: acknowledgeTask (Owner or Admin)
       * ----------------------------------------------------------- */
      case "acknowledgeTask": {
        const { taskId } = args;
        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
          throw new Error("A valid MongoDB ObjectId taskId is required to acknowledge a task");
        }

        const task = await Task.findOne({ _id: taskId, orgId });
        if (!task) {
          return {
            success: false,
            error: "Task not found in your organization.",
          };
        }

        // Ownership / Authorization check
        const isOwner = task.owner.toString() === user._id.toString();
        const isAdmin = user.role === ROLES.ADMIN;

        if (!isOwner && !isAdmin) {
          recordAiToolFailure(toolName, "FORBIDDEN_NOT_OWNER");
          return {
            success: false,
            error: "Forbidden: You can only acknowledge tasks assigned to you.",
          };
        }

        if (new Date() > task.ackDeadline) {
          return {
            success: false,
            error: "Cannot acknowledge task: The acknowledgment deadline has already expired. Task may be escalated.",
          };
        }

        // Centrally managed state machine transition
        const { task: updatedTask } = await transitionTask({
          task,
          toState: TASK_STATES.ACKNOWLEDGED,
          actor: user,
          triggeredBy: "USER",
          orgId,
        });

        // AuditLog record
        try {
          await AuditLog.create({
            orgId,
            userId: user._id,
            action: "AI_ACKNOWLEDGE_TASK",
            meta: {
              taskId: task._id,
              tool: "acknowledgeTask",
              previousState: TASK_STATES.OPEN,
              newState: TASK_STATES.ACKNOWLEDGED,
            },
          });
        } catch {
          // Non-blocking
        }

        result = {
          success: true,
          message: `Task '${task.title}' (${task._id}) successfully acknowledged.`,
          task: {
            id: updatedTask._id.toString(),
            title: updatedTask.title,
            state: updatedTask.state,
          },
        };
        break;
      }

      default: {
        recordAiToolFailure(toolName, "UNRECOGNIZED_TOOL");
        throw new Error(`Unrecognized AI tool: '${toolName}'. Only allowlisted tools may be executed.`);
      }
    }

    recordAiToolCall(toolName, "success");
    return result;
  } catch (error) {
    recordAiToolFailure(toolName, error.message || "EXECUTION_ERROR");
    logger.error("AI Tool execution error", {
      event: "ai.tool.error",
      toolName,
      error: error.message,
      orgId: orgId.toString(),
      requestId,
    });
    return {
      success: false,
      error: error.message || "An error occurred while executing the operation",
    };
  }
};
