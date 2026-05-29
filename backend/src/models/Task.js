import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
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
      enum: [
        "OPEN",
        "ACKNOWLEDGED",
        "IN_PROGRESS",
        "BLOCKED",
        "ESCALATED",
        "CLOSED",
      ],
      default: "OPEN",
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
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model("Task", taskSchema);

export default Task;
