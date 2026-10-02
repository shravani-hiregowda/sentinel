import mongoose from "mongoose";
import { ESCALATION_REASONS } from "../enums/escalationReasons.js";

const escalationEventSchema = new mongoose.Schema(
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

    escalationType: {
      type: String,
      enum: Object.values(ESCALATION_REASONS),
      required: true,
    },

    previousOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    newOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    previousState: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
    },

    triggeredBy: {
      type: String,
      enum: ["SYSTEM", "ADMIN", "USER"],
      default: "SYSTEM",
    },

    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes justified by audit & escalation query patterns:
// 1. Finding escalations by tenant: EscalationEvent.find({ orgId }).sort({ createdAt: -1 })
escalationEventSchema.index({ orgId: 1, createdAt: -1 });

// 2. Finding escalation history for a specific task: EscalationEvent.find({ task: taskId })
escalationEventSchema.index({ orgId: 1, task: 1, createdAt: 1 });

const EscalationEvent = mongoose.model("EscalationEvent", escalationEventSchema);

export default EscalationEvent;
