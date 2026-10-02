/**
 * Sentinel Database Index Initialization / Synchronization Script
 *
 * Idempotently creates and synchronizes all MongoDB indexes defined across models:
 * - Task (compound tenant filtering, sorting, pagination, SLA deadlines)
 * - User (unique email, systemRole)
 * - Membership (compound userId + organizationId unique index)
 * - TaskStateTransition (audit chronological transitions per task)
 * - AuditLog (organization audit log indexing)
 * - EscalationEvent (escalation history per task & tenant)
 *
 * Safe for production: syncIndexes() builds missing indexes and does NOT delete documents.
 */
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import AuditLog from "../models/AuditLog.js";
import EscalationEvent from "../models/EscalationEvent.js";

async function initializeIndexes() {
  console.log("🔧 Starting Sentinel MongoDB index initialization/sync...\n");

  await connectDB();

  const models = [
    { name: "Task", model: Task },
    { name: "User", model: User },
    { name: "Membership", model: Membership },
    { name: "TaskStateTransition", model: TaskStateTransition },
    { name: "AuditLog", model: AuditLog },
    { name: "EscalationEvent", model: EscalationEvent },
  ];

  try {
    for (const { name, model } of models) {
      console.log(`📦 Synchronizing indexes for collection: ${name}...`);
      const syncResult = await model.syncIndexes();
      const currentIndexes = await model.collection.indexes();
      console.log(`   ✔ Active indexes (${currentIndexes.length}):`);
      currentIndexes.forEach((idx) => {
        const keys = Object.entries(idx.key)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        console.log(`     - [${idx.name}]: { ${keys} }`);
      });
      if (syncResult && Object.keys(syncResult).length > 0) {
        console.log(`   ✔ Synced changes:`, syncResult);
      }
    }

    console.log("\n✅ ALL DATABASE INDEXES SYNCHRONIZED SUCCESSFULLY!");
  } catch (error) {
    console.error("❌ Failed to synchronize database indexes:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

initializeIndexes();
