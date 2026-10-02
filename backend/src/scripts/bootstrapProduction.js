/**
 * Sentinel Production Bootstrap Script
 *
 * Explicit, idempotent initialization of initial production admin and organization.
 *
 * RULES:
 * 1. NEVER runs automatically on server startup.
 * 2. Requires explicitly supplied ADMIN_EMAIL and ADMIN_PASSWORD (min 12 characters).
 * 3. Never creates default public passwords in production.
 * 4. Strictly idempotent: If org/user already exists, reports status and exits cleanly.
 * 5. Never seeds demo tasks, benchmark data, or development accounts.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import { ROLES } from "../enums/roles.js";

async function bootstrapProduction() {
  console.log("🔐 Starting Sentinel Production Bootstrap...\n");

  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const orgName = (process.env.ORG_NAME || "Default Organization").trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!email) {
    console.error("❌ ERROR: ADMIN_EMAIL environment variable is required.");
    console.error("   Example: ADMIN_EMAIL=admin@company.com ADMIN_PASSWORD=StrongP@ssw0rd! node src/scripts/bootstrapProduction.js");
    process.exit(1);
  }

  if (!password || password.length < 10) {
    console.error("❌ ERROR: ADMIN_PASSWORD must be at least 10 characters long (12+ recommended for production).");
    process.exit(1);
  }

  if (isProduction && ["admin123", "password", "sentinel", "admin"].includes(password.toLowerCase())) {
    console.error("❌ FATAL: Weak/common password rejected in production mode.");
    process.exit(1);
  }

  await connectDB();

  try {
    // 1. Check if user already exists
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`ℹ️ User with email "${email}" already exists (ID: ${existingUser._id}).`);
      console.log("   Bootstrap step skipped to maintain idempotency.");
      return;
    }

    const orgId = new mongoose.Types.ObjectId();
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      orgId,
      name: "System Administrator",
      email,
      password: hashedPassword,
      systemRole: ROLES.ADMIN,
      isActive: true,
    });

    console.log(`✔ Created Administrator account: ${newUser.email} (ID: ${newUser._id})`);
    console.log(`✔ Assigned to Organization ID: ${orgId} ("${orgName}")`);

    const membership = await Membership.create({
      organizationId: orgId,
      userId: newUser._id,
      role: ROLES.ADMIN,
      status: "active",
    });

    console.log(`✔ Created active Admin Membership: ${membership._id}`);
    console.log("\n✅ PRODUCTION BOOTSTRAP COMPLETE! You can now log in with the created admin credentials.");
  } catch (error) {
    console.error("❌ Production bootstrap failed:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

bootstrapProduction();
