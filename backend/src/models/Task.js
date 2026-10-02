import mongoose from "mongoose";
import { TASK_STATES } from "../enums/taskStates.js";

const taskSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      enum: Object.values(TASK_STATES),
      default: TASK_STATES.OPEN,
      required: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    ackDeadline: {
      type: Date,
      required: true,
    },

    actionDeadline: {
      type: Date,
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    slaVersion: {
      type: Number,
      default: 1,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes justified by actual query patterns:
// 1. Dashboard summary and state filtering: Task.find({ orgId, state })
taskSchema.index({ orgId: 1, state: 1 });

// 2. Member tasks and owner filtering: Task.find({ orgId, owner })
taskSchema.index({ orgId: 1, owner: 1 });
taskSchema.index({ orgId: 1, owner: 1, state: 1 });

// 3. Admin task listing sorted by date: Task.find({ orgId }).sort({ createdAt: -1 }) / sort({ updatedAt: -1 })
taskSchema.index({ orgId: 1, createdAt: -1 });
taskSchema.index({ orgId: 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, state: 1, updatedAt: -1 });
taskSchema.index({ orgId: 1, owner: 1, updatedAt: -1 });

// 4. Overdue queries scoped to tenant: Task.find({ orgId, state, ackDeadline })
taskSchema.index({ orgId: 1, ackDeadline: 1 });
taskSchema.index({ orgId: 1, actionDeadline: 1 });

// 5. System background escalation jobs: Task.find({ state: "OPEN", ackDeadline: { $lt: now } })
taskSchema.index({ state: 1, ackDeadline: 1 });
taskSchema.index({ state: 1, actionDeadline: 1 });

const Task = mongoose.model("Task", taskSchema);

export default Task;
