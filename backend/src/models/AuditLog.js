import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    action: {
      type: String,
      required: true,
    },
    meta: {
      type: Object,
    },
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

// Indexes justified by audit query patterns:
// 1. Organization audit queries: AuditLog.find({ orgId }).sort({ createdAt: -1 })
auditLogSchema.index({ orgId: 1, createdAt: -1 });

// 2. User audit history: AuditLog.find({ userId }).sort({ createdAt: -1 })
auditLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
