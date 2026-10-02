import dotenv from "dotenv";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import mongoose from "mongoose";

dotenv.config();

/**
 * Migration: Backfill Memberships from User documents
 *
 * Scans all User documents with an orgId and ensures a corresponding
 * Membership document exists. Safe and idempotent.
 */
export const migrateMemberships = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    console.log("🚀 Starting Membership backfill migration...");

    const users = await User.find({ orgId: { $ne: null } });
    console.log(`Found ${users.length} users with organization associations.`);

    let createdCount = 0;
    let existingCount = 0;

    for (const user of users) {
      const existing = await Membership.findOne({
        userId: user._id,
        organizationId: user.orgId,
      });

      if (!existing) {
        await Membership.create({
          userId: user._id,
          organizationId: user.orgId,
          role: user.role || "MEMBER",
          status: user.isActive ? "ACTIVE" : "SUSPENDED",
          joinedAt: user.createdAt || new Date(),
        });
        createdCount++;
      } else {
        existingCount++;
      }
    }

    console.log(`✅ Membership migration completed:`);
    console.log(`   - Newly created memberships: ${createdCount}`);
    console.log(`   - Existing memberships: ${existingCount}`);

    return { createdCount, existingCount };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

// Allow direct execution: node src/scripts/migrateMemberships.js
if (process.argv[1]?.endsWith("migrateMemberships.js")) {
  migrateMemberships()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
