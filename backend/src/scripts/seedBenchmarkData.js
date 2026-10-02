import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Organization from "../models/Organization.js";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import Task from "../models/Task.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import AuditLog from "../models/AuditLog.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { ROLES } from "../enums/roles.js";

dotenv.config();

const TARGET_DB_URI =
  process.env.BENCHMARK_MONGO_URI ||
  "mongodb://127.0.0.1:27017/sentinel_perf";

const BATCH_SIZE = 5000;

export const seedBenchmarkData = async ({
  mongoUri = TARGET_DB_URI,
  orgCount = 12,
  userCount = 1020,
  taskCount = 50000,
  transitionCount = 100000,
  auditLogCount = 100000,
  dropExisting = true,
} = {}) => {
  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Deterministic Benchmark Seeding`);
  console.log(`🎯 Target Database: ${mongoUri}`);
  console.log(`======================================================\n`);

  if (!mongoUri.includes("perf") && !mongoUri.includes("benchmark") && !mongoUri.includes("test")) {
    throw new Error(
      `Safety guard: Refusing to seed benchmark data into non-perf/benchmark DB: ${mongoUri}`
    );
  }

  const conn = await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB at ${conn.connection.host}/${conn.connection.name}`);

  if (dropExisting) {
    console.log("🧹 Dropping existing collections in benchmark database...");
    await Organization.deleteMany({});
    await User.deleteMany({});
    await Membership.deleteMany({});
    await Task.deleteMany({});
    await TaskStateTransition.deleteMany({});
    await AuditLog.deleteMany({});
    console.log("🧹 Collections cleared.");
  }

  // 1. Create Organizations
  console.log(`🏢 Creating ${orgCount} Organizations...`);
  const orgDocs = [];
  for (let i = 1; i <= orgCount; i++) {
    orgDocs.push({
      _id: new mongoose.Types.ObjectId(),
      name: `Benchmark Org ${i}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
  }
  await Organization.insertMany(orgDocs);
  console.log(`✅ Created ${orgDocs.length} Organizations.`);

  // 2. Pre-hash passwords once
  console.log("🔑 Generating pre-hashed passwords for benchmark users...");
  const hashedPassword = await bcrypt.hash("Benchmark@123", 4); // Quick cost for benchmark dataset

  // 3. Create Users & Memberships
  console.log(`👥 Creating ${userCount} Users & Memberships...`);
  const userDocs = [];
  const membershipDocs = [];

  // Org 0 (Primary Benchmark Tenant) gets 120 members; remaining orgs share the rest
  const usersPerOrg = Math.floor(userCount / orgCount);

  let userIndex = 0;
  for (let o = 0; o < orgCount; o++) {
    const org = orgDocs[o];
    // Each org gets at least 1 Admin
    const adminId = new mongoose.Types.ObjectId();
    userDocs.push({
      _id: adminId,
      orgId: org._id,
      name: `Admin Org ${o + 1}`,
      email: `admin.org${o + 1}@sentinel.perf`,
      password: hashedPassword,
      role: ROLES.ADMIN,
      isActive: true,
      forcePasswordChange: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    membershipDocs.push({
      userId: adminId,
      organizationId: org._id,
      role: ROLES.ADMIN,
      status: "ACTIVE",
      joinedAt: new Date("2026-01-01T00:00:00Z"),
    });
    userIndex++;

    const membersForThisOrg =
      o === 0 ? 120 : Math.min(usersPerOrg - 1, userCount - userIndex);

    for (let m = 1; m <= membersForThisOrg; m++) {
      const memberId = new mongoose.Types.ObjectId();
      userDocs.push({
        _id: memberId,
        orgId: org._id,
        name: `Member ${m} Org ${o + 1}`,
        email: `member${m}.org${o + 1}@sentinel.perf`,
        password: hashedPassword,
        role: ROLES.MEMBER,
        isActive: true,
        forcePasswordChange: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });
      membershipDocs.push({
        userId: memberId,
        organizationId: org._id,
        role: ROLES.MEMBER,
        status: "ACTIVE",
        joinedAt: new Date("2026-01-01T00:00:00Z"),
      });
      userIndex++;
    }
  }

  await User.insertMany(userDocs);
  await Membership.insertMany(membershipDocs);
  console.log(`✅ Created ${userDocs.length} Users and ${membershipDocs.length} Memberships.`);

  // Group users by org for tenant-safe task assignment
  const usersByOrg = new Map();
  for (const user of userDocs) {
    const key = user.orgId.toString();
    if (!usersByOrg.has(key)) usersByOrg.set(key, []);
    usersByOrg.get(key).push(user);
  }

  // 4. Create Tasks
  console.log(`📋 Generating ${taskCount} Tasks...`);
  const taskDocs = [];
  const stateList = [
    TASK_STATES.OPEN,
    TASK_STATES.ACKNOWLEDGED,
    TASK_STATES.IN_PROGRESS,
    TASK_STATES.ESCALATED,
    TASK_STATES.CLOSED,
  ];

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  for (let t = 0; t < taskCount; t++) {
    // 50% of tasks belong to Org 1 (primary benchmark tenant) to simulate a high-density tenant
    const orgIndex = t % 2 === 0 ? 0 : 1 + (t % (orgCount - 1));
    const org = orgDocs[orgIndex];
    const orgUsers = usersByOrg.get(org._id.toString());
    const admin = orgUsers.find((u) => u.role === ROLES.ADMIN) || orgUsers[0];
    const members = orgUsers.filter((u) => u.role === ROLES.MEMBER);
    const owner = members.length > 0 ? members[t % members.length] : admin;

    const state = stateList[t % stateList.length];
    // Deterministic deadlines
    const isOverdue = t % 5 === 0;
    const ackDeadline = isOverdue
      ? new Date(now - (t % 10 + 1) * oneHour)
      : new Date(now + ((t % 48) + 1) * oneHour);
    const actionDeadline = isOverdue
      ? new Date(now - (t % 5 + 1) * oneHour)
      : new Date(now + ((t % 72) + 24) * oneHour);

    const createdAt = new Date(now - ((t % 30) + 1) * oneDay);
    const updatedAt = new Date(createdAt.getTime() + (t % 24) * oneHour);

    taskDocs.push({
      _id: new mongoose.Types.ObjectId(),
      orgId: org._id,
      title: `Task #${t + 1}: Governance action item ${t + 1}`,
      description: `Benchmark load verification item ${t + 1} with realistic audit criteria.`,
      state,
      owner: owner._id,
      createdBy: admin._id,
      ackDeadline,
      actionDeadline,
      slaVersion: (t % 3) + 1,
      createdAt,
      updatedAt,
    });

    if (taskDocs.length >= BATCH_SIZE) {
      await Task.insertMany(taskDocs);
      taskDocs.length = 0;
      process.stdout.write(`  ... inserted ${t + 1} / ${taskCount} tasks\r`);
    }
  }

  if (taskDocs.length > 0) {
    await Task.insertMany(taskDocs);
  }
  console.log(`\n✅ Created ${taskCount} Tasks.`);

  // 5. Create TaskStateTransitions
  console.log(`🔄 Generating ${transitionCount} Task State Transitions...`);
  // Load tasks IDs, states, orgIds, owners for deterministic transitions
  const seededTasks = await Task.find(
    {},
    { _id: 1, orgId: 1, owner: 1, createdBy: 1, state: 1, createdAt: 1 }
  ).lean();

  const transitionDocs = [];
  let transCreated = 0;

  for (let i = 0; i < seededTasks.length && transCreated < transitionCount; i++) {
    const task = seededTasks[i];
    const t0 = task.createdAt;

    // Transition 1: Creation -> OPEN
    transitionDocs.push({
      _id: new mongoose.Types.ObjectId(),
      orgId: task.orgId,
      task: task._id,
      fromState: TASK_STATES.OPEN,
      toState: task.state === TASK_STATES.OPEN ? TASK_STATES.OPEN : TASK_STATES.ACKNOWLEDGED,
      triggeredBy: "USER",
      actor: task.owner,
      createdAt: new Date(t0.getTime() + 15 * 60 * 1000),
      updatedAt: new Date(t0.getTime() + 15 * 60 * 1000),
    });
    transCreated++;

    // Transition 2: Next step if not OPEN
    if (transCreated < transitionCount) {
      transitionDocs.push({
        _id: new mongoose.Types.ObjectId(),
        orgId: task.orgId,
        task: task._id,
        fromState: TASK_STATES.ACKNOWLEDGED,
        toState: task.state,
        triggeredBy: task.state === TASK_STATES.ESCALATED ? "SYSTEM" : "USER",
        actor: task.state === TASK_STATES.ESCALATED ? null : task.owner,
        createdAt: new Date(t0.getTime() + 45 * 60 * 1000),
        updatedAt: new Date(t0.getTime() + 45 * 60 * 1000),
      });
      transCreated++;
    }

    if (transitionDocs.length >= BATCH_SIZE) {
      await TaskStateTransition.insertMany(transitionDocs);
      transitionDocs.length = 0;
      process.stdout.write(`  ... inserted ${transCreated} / ${transitionCount} transitions\r`);
    }
  }

  if (transitionDocs.length > 0) {
    await TaskStateTransition.insertMany(transitionDocs);
  }
  console.log(`\n✅ Created ${transCreated} Task State Transitions.`);

  // 6. Create AuditLogs
  console.log(`📜 Generating ${auditLogCount} Audit Logs...`);
  const auditDocs = [];
  const actions = [
    "USER_LOGIN",
    "TASK_CREATED",
    "TASK_STATE_TRANSITION",
    "TASK_REASSIGNED",
    "SLA_ESCALATED",
    "ORGANIZATION_UPDATED",
  ];

  for (let a = 0; a < auditLogCount; a++) {
    const org = orgDocs[a % orgDocs.length];
    const orgUsers = usersByOrg.get(org._id.toString());
    const user = orgUsers[a % orgUsers.length];

    auditDocs.push({
      _id: new mongoose.Types.ObjectId(),
      orgId: org._id,
      userId: user._id,
      action: actions[a % actions.length],
      meta: {
        itemIndex: a,
        description: `Audit event #${a + 1}`,
      },
      ip: `192.168.1.${(a % 250) + 1}`,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BenchmarkClient/1.0",
      createdAt: new Date(now - (a % (90 * 24 * 3600)) * 1000),
      updatedAt: new Date(now - (a % (90 * 24 * 3600)) * 1000),
    });

    if (auditDocs.length >= BATCH_SIZE) {
      await AuditLog.insertMany(auditDocs);
      auditDocs.length = 0;
      process.stdout.write(`  ... inserted ${a + 1} / ${auditLogCount} audit logs\r`);
    }
  }

  if (auditDocs.length > 0) {
    await AuditLog.insertMany(auditDocs);
  }
  console.log(`\n✅ Created ${auditLogCount} Audit Logs.`);

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n======================================================`);
  console.log(`🎉 Benchmark Dataset Seeding Complete in ${elapsedSec}s!`);
  console.log(`   🏢 Organizations:       ${orgDocs.length}`);
  console.log(`   👥 Users:               ${userDocs.length}`);
  console.log(`   🤝 Memberships:         ${membershipDocs.length}`);
  console.log(`   📋 Tasks:               ${taskCount}`);
  console.log(`   🔄 State Transitions:   ${transCreated}`);
  console.log(`   📜 Audit Logs:          ${auditLogCount}`);
  console.log(`   🎯 Target DB:           ${mongoUri}`);
  console.log(`======================================================\n`);

  return {
    orgs: orgDocs,
    users: userDocs,
    primaryOrg: orgDocs[0],
    primaryAdmin: userDocs[0],
  };
};

// Allow direct CLI execution
if (process.argv[1]?.endsWith("seedBenchmarkData.js")) {
  seedBenchmarkData()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Benchmark seeding error:", err);
      process.exit(1);
    });
}
