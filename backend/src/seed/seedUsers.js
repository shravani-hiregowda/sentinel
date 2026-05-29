import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";

dotenv.config();

const seedUsers = async () => {
  try {
    await connectDB();
    console.log("🔗 MongoDB connected for seeding");

    const hashedAdminPassword = await bcrypt.hash("Admin@123", 10);
    const hashedMemberPassword = await bcrypt.hash("Member@123", 10);

    // ✅ Admin Upsert (Fixes missing password)
    await User.updateOne(
      { email: "admin@sentinel.dev" },
      {
        $set: {
          name: "Admin",
          email: "admin@sentinel.dev",
          password: hashedAdminPassword,
          role: "ADMIN",
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
            name: m.name,
            email: m.email,
            password: hashedMemberPassword,
            role: "MEMBER",
          },
        },
        { upsert: true }
      );
    }

    console.log("✅ Users updated/seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed", err);
    process.exit(1);
  }
};

seedUsers();
