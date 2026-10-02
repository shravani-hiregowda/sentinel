import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import Membership from "../models/Membership.js";
import { ROLES } from "../enums/roles.js";

dotenv.config();

const seedUsers = async () => {
  try {
    await connectDB();
    console.log("🔗 MongoDB connected for seeding");

    // 1. Ensure a default organization exists
    let org = await Organization.findOne({ name: "Sentinel Dev Org" });
    if (!org) {
      org = await Organization.create({ name: "Sentinel Dev Org" });
      console.log(`🏢 Created default organization: ${org.name}`);
    } else {
      console.log(`🏢 Existing organization found: ${org.name}`);
    }

    const hashedAdminPassword = await bcrypt.hash("Admin@123", 10);
    const hashedMemberPassword = await bcrypt.hash("Member@123", 10);

    // Admin Upsert
    await User.updateOne(
      { email: "admin@sentinel.dev" },
      {
        $set: {
          orgId: org._id,
          name: "Admin",
          email: "admin@sentinel.dev",
          password: hashedAdminPassword,
          role: ROLES.ADMIN,
          forcePasswordChange: false,
        },
      },
      { upsert: true }
    );

    const adminUser = await User.findOne({ email: "admin@sentinel.dev" });
    await Membership.updateOne(
      { userId: adminUser._id, organizationId: org._id },
      {
        $set: {
          role: ROLES.ADMIN,
          status: "ACTIVE",
        },
        $setOnInsert: { joinedAt: new Date() },
      },
      { upsert: true }
    );

    // Members Upsert
    const members = [
      { name: "Arjun", email: "arjun@sentinel.dev" },
      { name: "Kavya", email: "kavya@sentinel.dev" },
      { name: "Shravani", email: "shravani@sentinel.dev" },
    ];

    for (const m of members) {
      await User.updateOne(
        { email: m.email },
        {
          $set: {
            orgId: org._id,
            name: m.name,
            email: m.email,
            password: hashedMemberPassword,
            role: ROLES.MEMBER,
            forcePasswordChange: false,
          },
        },
        { upsert: true }
      );

      const memberUser = await User.findOne({ email: m.email });
      await Membership.updateOne(
        { userId: memberUser._id, organizationId: org._id },
        {
          $set: {
            role: ROLES.MEMBER,
            status: "ACTIVE",
          },
          $setOnInsert: { joinedAt: new Date() },
        },
        { upsert: true }
      );
    }

    console.log("✅ Users and Memberships updated/seeded successfully with orgId");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed", err);
    process.exit(1);
  }
};

seedUsers();
