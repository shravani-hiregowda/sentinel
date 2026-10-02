import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import IORedis from "ioredis";
import Organization from "../src/models/Organization.js";
import User from "../src/models/User.js";
import Membership from "../src/models/Membership.js";
import Task from "../src/models/Task.js";
import TaskStateTransition from "../src/models/TaskStateTransition.js";
import EscalationEvent from "../src/models/EscalationEvent.js";
import AuditLog from "../src/models/AuditLog.js";
import { getRedisConfig, closeRedis } from "../src/config/redis.js";
import { closeEscalationQueue } from "../src/queues/escalation.queue.js";


process.env.JWT_SECRET = process.env.JWT_SECRET || "super_strong_secret_key";
const JWT_SECRET = process.env.JWT_SECRET;
const TEST_DB_URI =
  process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/sentinel_test_runner";

let testRedisClient = null;

export const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI);
  }
};

export const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await Promise.all([
      Organization.deleteMany({}),
      User.deleteMany({}),
      Membership.deleteMany({}),
      Task.deleteMany({}),
      TaskStateTransition.deleteMany({}),
      EscalationEvent.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  }
};

export const disconnectTestDB = async () => {
  await closeEscalationQueue();
  await closeRedis();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};


export const getTestRedisClient = () => {
  if (!testRedisClient) {
    const config = getRedisConfig();
    testRedisClient = new IORedis(config);
  }
  return testRedisClient;
};

export const clearTestRedis = async () => {
  try {
    const redis = getTestRedisClient();
    await redis.flushdb();
  } catch (err) {
    console.warn("⚠️ Unable to flush test Redis:", err.message);
  }
};

export const disconnectTestRedis = async () => {
  await closeEscalationQueue();
  if (testRedisClient) {
    await testRedisClient.quit();
    testRedisClient = null;
  }
};

export const generateTestToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      orgId: user.orgId,
      tokenVersion: user.tokenVersion || 0,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
};

export const createTestUser = async ({
  name = "Test User",
  email,
  password = "Password@123",
  role = "MEMBER",
  orgId,
}) => {
  const hashedPassword = await bcrypt.hash(password, 8);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    orgId,
    isActive: true,
  });

  await Membership.create({
    userId: user._id,
    organizationId: orgId,
    role,
    status: "ACTIVE",
  });

  const token = generateTestToken(user);
  return { user, token };
};
