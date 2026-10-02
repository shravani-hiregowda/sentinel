import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../enums/roles.js";

const userSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.MEMBER,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // 🔐 ENTERPRISE SECURITY
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes justified by query patterns:
// 1. Finding members/admins by tenant: User.find({ orgId, role, isActive: true })
userSchema.index({ orgId: 1, role: 1 });
userSchema.index({ orgId: 1, isActive: 1 });

export default mongoose.model("User", userSchema);
