import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";

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

    // ✅ Admin Upsert (Fixes missing password and orgId)
    await User.updateOne(
      { email: "admin@sentinel.dev" },
      {
        $set: {
          orgId: org._id,
          name: "Admin",
          email: "admin@sentinel.dev",
          password: hashedAdminPassword,
          role: "ADMIN",
          forcePasswordChange: false,
        },
      },
      { upsert: true }
    );

    // ✅ Members Upsert
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
            role: "MEMBER",
            forcePasswordChange: false,
          },
        },
        { upsert: true }
      );
    }

    console.log("✅ Users updated/seeded successfully with orgId");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed", err);
    process.exit(1);
  }
};

seedUsers();

