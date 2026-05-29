import mongoose from "mongoose";

const taskStateTransitionSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
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
      enum: ["USER", "SYSTEM"],
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

const TaskStateTransition = mongoose.model(
  "TaskStateTransition",
  taskStateTransitionSchema
);

export default TaskStateTransition;
