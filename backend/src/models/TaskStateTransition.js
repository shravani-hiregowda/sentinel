import mongoose from "mongoose";

const taskStateTransitionSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },

    fromState: {
      type: String,
      required: true,
    },

    toState: {
      type: String,
      required: true,
    },

    triggeredBy: {
      type: String,
      enum: ["USER", "SYSTEM", "ADMIN"],
      required: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null when SYSTEM
    },
  },
  {
    timestamps: true,
  }
);

// Indexes justified by actual query patterns:
// 1. Task timeline queries: TaskStateTransition.find({ task: taskId, orgId }).sort({ createdAt: 1 })
taskStateTransitionSchema.index({ orgId: 1, task: 1, createdAt: 1 });

// 2. Activity feed queries: TaskStateTransition.find({ orgId }).sort({ createdAt: -1 })
taskStateTransitionSchema.index({ orgId: 1, createdAt: -1 });

const TaskStateTransition = mongoose.model(
  "TaskStateTransition",
  taskStateTransitionSchema
);

export default TaskStateTransition;
