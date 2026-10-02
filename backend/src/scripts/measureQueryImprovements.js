import mongoose from "mongoose";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { TASK_STATES } from "../enums/taskStates.js";

const MONGO_URI =
  process.env.BENCHMARK_MONGO_URI ||
  "mongodb://127.0.0.1:27017/sentinel_perf";

export const benchmarkQueries = async () => {
  await mongoose.connect(MONGO_URI);
  const org = await Organization.findOne({ name: "Benchmark Org 1" });
  const orgId = org._id;
  const now = new Date();

  console.log(`\n======================================================`);
  console.log(`⏱️ BENCHMARKING BEFORE VS AFTER QUERY OPTIMIZATIONS`);
  console.log(`======================================================\n`);

  // --- 1. Dashboard Summary: 7 countDocuments vs 1 aggregation ---
  console.log(`Testing Dashboard Summary...`);
  // Unoptimized: 7 countDocuments
  const t0 = Date.now();
  const open = await Task.countDocuments({ orgId, state: TASK_STATES.OPEN });
  const acknowledged = await Task.countDocuments({ orgId, state: TASK_STATES.ACKNOWLEDGED });
  const inProgress = await Task.countDocuments({ orgId, state: TASK_STATES.IN_PROGRESS });
  const escalated = await Task.countDocuments({ orgId, state: TASK_STATES.ESCALATED });
  const closed = await Task.countDocuments({ orgId, state: TASK_STATES.CLOSED });
  const overdueAck = await Task.countDocuments({
    orgId,
    state: TASK_STATES.OPEN,
    ackDeadline: { $lt: now },
  });
  const overdueAction = await Task.countDocuments({
    orgId,
    state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
    actionDeadline: { $lt: now },
  });
  const oldDashTime = Date.now() - t0;

  // Optimized: 1 Aggregation
  const t1 = Date.now();
  const [dashAgg] = await Task.aggregate([
    { $match: { orgId } },
    {
      $group: {
        _id: null,
        open: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.OPEN] }, 1, 0] } },
        acknowledged: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.ACKNOWLEDGED] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.IN_PROGRESS] }, 1, 0] } },
        escalated: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.ESCALATED] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.CLOSED] }, 1, 0] } },
        overdueAck: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$state", TASK_STATES.OPEN] },
                  { $lt: ["$ackDeadline", now] },
                ],
              },
              1,
              0,
            ],
          },
        },
        overdueAction: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ["$state", [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS]] },
                  { $lt: ["$actionDeadline", now] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const newDashTime = Date.now() - t1;

  // Parallel countDocuments via Promise.all
  const tParallel = Date.now();
  const [
    _pOpen,
    _pAck,
    _pInProg,
    _pEsc,
    _pClosed,
    _pOverdueAck,
    _pOverdueAction,
  ] = await Promise.all([
    Task.countDocuments({ orgId, state: TASK_STATES.OPEN }),
    Task.countDocuments({ orgId, state: TASK_STATES.ACKNOWLEDGED }),
    Task.countDocuments({ orgId, state: TASK_STATES.IN_PROGRESS }),
    Task.countDocuments({ orgId, state: TASK_STATES.ESCALATED }),
    Task.countDocuments({ orgId, state: TASK_STATES.CLOSED }),
    Task.countDocuments({
      orgId,
      state: TASK_STATES.OPEN,
      ackDeadline: { $lt: now },
    }),
    Task.countDocuments({
      orgId,
      state: { $in: [TASK_STATES.ACKNOWLEDGED, TASK_STATES.IN_PROGRESS] },
      actionDeadline: { $lt: now },
    }),
  ]);
  const parallelDashTime = Date.now() - tParallel;

  console.log(`  Dashboard Summary (7 sequential):  ${oldDashTime} ms`);
  console.log(`  Dashboard Summary (7 parallel):    ${parallelDashTime} ms`);
  console.log(`  Dashboard Summary (1 full doc agg): ${newDashTime} ms`);
  console.log(`  Improvement (Parallel vs Seq):     ${((1 - parallelDashTime / oldDashTime) * 100).toFixed(1)}%\n`);

  // Verify correctness
  if (
    open !== dashAgg.open ||
    acknowledged !== dashAgg.acknowledged ||
    inProgress !== dashAgg.inProgress ||
    escalated !== dashAgg.escalated ||
    closed !== dashAgg.closed ||
    overdueAck !== dashAgg.overdueAck ||
    overdueAction !== dashAgg.overdueAction
  ) {
    throw new Error("Dashboard aggregation result mismatch!");
  }
  console.log(`  ✅ Aggregation results match exactly with 7 separate count queries.\n`);

  // --- 2. Member Performance: N+1 queries vs Single Aggregation ---
  console.log(`Testing Member Performance (120 members in Org 1)...`);
  const members = await User.find({ orgId, role: "MEMBER", isActive: true });

  // Unoptimized: Loop with 3 queries per member (361 queries total)
  const t2 = Date.now();
  const oldReport = [];
  for (const member of members) {
    const totalAssigned = await Task.countDocuments({ orgId, owner: member._id });
    const comp = await Task.countDocuments({
      orgId,
      owner: member._id,
      state: TASK_STATES.CLOSED,
    });
    const esc = await Task.countDocuments({
      orgId,
      owner: member._id,
      state: TASK_STATES.ESCALATED,
    });
    const completionRate =
      totalAssigned === 0 ? 0 : Math.round((comp / totalAssigned) * 100);
    oldReport.push({
      member: { id: member._id, name: member.name, email: member.email },
      totalAssigned,
      completed: comp,
      escalationsCaused: esc,
      completionRate,
    });
  }
  oldReport.sort((a, b) => b.completionRate - a.completionRate);
  const oldMemberTime = Date.now() - t2;

  // Optimized: 1 Aggregation + in-memory mapping (2 queries total)
  const t3 = Date.now();
  const activeMembers = await User.find({ orgId, role: "MEMBER", isActive: true })
    .select("name email")
    .lean();

  const taskStats = await Task.aggregate([
    { $match: { orgId } },
    {
      $group: {
        _id: "$owner",
        totalAssigned: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.CLOSED] }, 1, 0] } },
        escalationsCaused: { $sum: { $cond: [{ $eq: ["$state", TASK_STATES.ESCALATED] }, 1, 0] } },
      },
    },
  ]);

  const statsMap = new Map();
  for (const stat of taskStats) {
    statsMap.set(stat._id.toString(), stat);
  }

  const newReport = activeMembers.map((m) => {
    const stat = statsMap.get(m._id.toString()) || { totalAssigned: 0, completed: 0, escalationsCaused: 0 };
    const completionRate =
      stat.totalAssigned === 0 ? 0 : Math.round((stat.completed / stat.totalAssigned) * 100);
    return {
      member: { id: m._id, name: m.name, email: m.email },
      totalAssigned: stat.totalAssigned,
      completed: stat.completed,
      escalationsCaused: stat.escalationsCaused,
      completionRate,
    };
  });
  newReport.sort((a, b) => b.completionRate - a.completionRate);
  const newMemberTime = Date.now() - t3;

  console.log(`  Member Performance (361 queries): ${oldMemberTime} ms`);
  console.log(`  Member Performance (2 queries):   ${newMemberTime} ms`);
  console.log(`  Improvement:                      ${((1 - newMemberTime / oldMemberTime) * 100).toFixed(1)}%\n`);

  // Verify correctness
  if (oldReport.length !== newReport.length) {
    throw new Error("Report length mismatch!");
  }
  for (let i = 0; i < oldReport.length; i++) {
    if (
      oldReport[i].totalAssigned !== newReport[i].totalAssigned ||
      oldReport[i].completed !== newReport[i].completed ||
      oldReport[i].escalationsCaused !== newReport[i].escalationsCaused
    ) {
      throw new Error(`Data mismatch at index ${i}`);
    }
  }
  console.log(`  ✅ Aggregation results match exactly across all 120 members.\n`);

  await mongoose.disconnect();
};

benchmarkQueries()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
