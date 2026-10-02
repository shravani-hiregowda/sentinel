import mongoose from "mongoose";
import Task from "../models/Task.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { TASK_STATES } from "../enums/taskStates.js";

const MONGO_URI =
  process.env.BENCHMARK_MONGO_URI ||
  "mongodb://127.0.0.1:27017/sentinel_perf";

export const runQueryAudit = async () => {
  await mongoose.connect(MONGO_URI);
  console.log(`\n======================================================`);
  console.log(`🔍 MONGODB QUERY AUDIT & EXPLAIN (DATABASE: sentinel_perf)`);
  console.log(`======================================================\n`);

  // Fetch benchmark org and users
  const org = await Organization.findOne({ name: "Benchmark Org 1" });
  if (!org) {
    throw new Error("Benchmark Org 1 not found. Please run seedBenchmarkData.js first.");
  }
  const orgId = org._id;
  const member = await User.findOne({ orgId, role: "MEMBER" });
  const sampleTask = await Task.findOne({ orgId });
  const now = new Date();

  console.log(`Tenant Context: orgId=${orgId}, sampleMemberId=${member?._id}, sampleTaskId=${sampleTask?._id}\n`);
  console.log(`Syncing indexes...`);
  await Task.syncIndexes();
  await TaskStateTransition.syncIndexes();
  await AuditLog.syncIndexes();
  console.log(`Indexes synced successfully.\n`);

  const results = [];

  const auditExplain = async (name, queryPromise) => {
    const explainResult = await queryPromise.explain("executionStats");
    const stats = explainResult.executionStats;
    const winningPlan = explainResult.queryPlanner.winningPlan;

    // Helper to find stages in winningPlan
    const findStages = (plan) => {
      const stages = [];
      const traverse = (p) => {
        if (!p) return;
        if (p.stage) stages.push(p.stage);
        if (p.inputStage) traverse(p.inputStage);
        if (p.inputStages) p.inputStages.forEach(traverse);
      };
      traverse(plan);
      return stages;
    };

    const stages = findStages(winningPlan);
    const hasCollscan = stages.includes("COLLSCAN");
    const hasInMemSort = stages.includes("SORT");

    const record = {
      name,
      executionTimeMillis: stats.executionTimeMillis,
      totalDocsExamined: stats.totalDocsExamined,
      totalKeysExamined: stats.totalKeysExamined,
      nReturned: stats.nReturned,
      winningStage: winningPlan.stage,
      allStages: stages.join(" -> "),
      hasCollscan,
      hasInMemSort,
      ratio: stats.nReturned > 0 ? (stats.totalDocsExamined / stats.nReturned).toFixed(1) : "N/A",
    };

    results.push(record);

    console.log(`--- [${name}] ---`);
    console.log(`  Execution Time:    ${record.executionTimeMillis} ms`);
    console.log(`  Docs Examined:     ${record.totalDocsExamined} (Returned: ${record.nReturned})`);
    console.log(`  Keys Examined:     ${record.totalKeysExamined}`);
    console.log(`  Stages:            ${record.allStages}`);
    console.log(`  In-memory SORT:    ${record.hasInMemSort ? "⚠️ YES (BOTTLENECK)" : "NO"}`);
    console.log(`  COLLSCAN:          ${record.hasCollscan ? "🚨 YES (BOTTLENECK)" : "NO"}`);
    console.log(``);

    return record;
  };

  // 1. Dashboard summary counts
  await auditExplain(
    "1. Dashboard: Task.countDocuments({ orgId, state: OPEN })",
    Task.find({ orgId, state: TASK_STATES.OPEN })
  );

  // 2. Dashboard overdue ack
  await auditExplain(
    "2. Dashboard Overdue Ack: Task.find({ orgId, state: OPEN, ackDeadline < now })",
    Task.find({ orgId, state: TASK_STATES.OPEN, ackDeadline: { $lt: now } })
  );

  // 3. Dashboard overdue action
  await auditExplain(
    "3. Dashboard Overdue Action: Task.find({ orgId, state: [ACK, IN_PROG], actionDeadline < now })",
    Task.find({
      orgId,
      state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
      actionDeadline: { $lt: now },
    })
  );

  // 4. Admin task list default (sorted by updatedAt: -1, limit 10)
  await auditExplain(
    "4. Admin Task Listing: Task.find({ orgId }).sort({ updatedAt: -1 }).limit(10)",
    Task.find({ orgId }).sort({ updatedAt: -1 }).limit(10)
  );

  // 5. Admin task list filtered by state and sorted by updatedAt: -1
  await auditExplain(
    "5. Admin Task List Filtered: Task.find({ orgId, state: OPEN }).sort({ updatedAt: -1 }).limit(10)",
    Task.find({ orgId, state: TASK_STATES.OPEN }).sort({ updatedAt: -1 }).limit(10)
  );

  // 6. Member tasks (sorted by updatedAt: -1)
  if (member) {
    await auditExplain(
      "6. Member Tasks: Task.find({ orgId, owner }).sort({ updatedAt: -1 })",
      Task.find({ orgId, owner: member._id }).sort({ updatedAt: -1 })
    );

    // 7. Member performance count for single member in loop
    await auditExplain(
      "7. Member Performance Query: Task.find({ orgId, owner, state: CLOSED })",
      Task.find({ orgId, owner: member._id, state: TASK_STATES.CLOSED })
    );
  }

  // 8. Task timeline
  if (sampleTask) {
    await auditExplain(
      "8. Task Timeline: TaskStateTransition.find({ orgId, task }).sort({ createdAt: 1 })",
      TaskStateTransition.find({ orgId, task: sampleTask._id }).sort({ createdAt: 1 })
    );
  }

  // 9. Activity Feed
  await auditExplain(
    "9. Activity Feed: TaskStateTransition.find({ orgId }).sort({ createdAt: -1 }).limit(20)",
    TaskStateTransition.find({ orgId }).sort({ createdAt: -1 }).limit(20)
  );

  // 10. Audit log list
  await auditExplain(
    "10. Audit Logs: AuditLog.find({ orgId }).sort({ createdAt: -1 }).limit(50)",
    AuditLog.find({ orgId }).sort({ createdAt: -1 }).limit(50)
  );

  console.log(`\n======================================================`);
  console.log(`📊 SUMMARY OF IDENTIFIED BOTTLENECKS:`);
  console.log(`======================================================`);
  const bottlenecks = results.filter((r) => r.hasInMemSort || r.hasCollscan || r.totalDocsExamined > 500);
  bottlenecks.forEach((b) => {
    console.log(`❌ [${b.name}]`);
    console.log(`   Time: ${b.executionTimeMillis}ms | DocsExamined: ${b.totalDocsExamined} | InMemSort: ${b.hasInMemSort} | Stages: ${b.allStages}`);
  });

  await mongoose.disconnect();
  return results;
};

if (process.argv[1]?.endsWith("auditQueries.js")) {
  runQueryAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
