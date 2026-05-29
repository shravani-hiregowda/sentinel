import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    meta: { type: Object },
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

export default mongoose.model("AuditLog", auditLogSchema);
