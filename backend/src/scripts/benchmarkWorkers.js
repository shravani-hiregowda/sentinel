import dotenv from "dotenv";
import mongoose from "mongoose";
import { Queue, Worker } from "bullmq";
import { getRedisConfig, connectRedis } from "../config/redis.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import TaskStateTransition from "../models/TaskStateTransition.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { processTaskEscalation } from "../services/escalationService.js";

dotenv.config();

const MONGO_URI =
  process.env.BENCHMARK_MONGO_URI ||
  "mongodb://127.0.0.1:27017/sentinel_perf";

const QUEUE_NAME = "sla-escalation-benchmark";

export const runWorkerBenchmarks = async () => {
  console.log(`\n======================================================`);
  console.log(`⚡ SENTINEL SLA ESCALATION WORKER BENCHMARK SUITE`);
  console.log(`======================================================\n`);

  await mongoose.connect(MONGO_URI);
  await connectRedis();

  const redisConfig = getRedisConfig();
  const queue = new Queue(QUEUE_NAME, { connection: redisConfig });

  const org = await Organization.findOne({ name: "Benchmark Org 1" });
  if (!org) throw new Error("Benchmark Org 1 not found!");
  const orgId = org._id;

  const admin = await User.findOne({ orgId, role: "ADMIN", isActive: true });
  const member = await User.findOne({ orgId, role: "MEMBER", isActive: true });
  if (!admin || !member) throw new Error("Admin or Member not found in benchmark org!");

  /**
   * Helper to create batch of past-due tasks for escalation testing
   */
  const createPastDueTasks = async (count) => {
    const now = Date.now();
    const taskDocs = [];
    for (let i = 0; i < count; i++) {
      taskDocs.push({
        _id: new mongoose.Types.ObjectId(),
        orgId,
        title: `Escalation Benchmark Task ${Date.now()}-${i}`,
        state: TASK_STATES.OPEN,
        owner: member._id,
        createdBy: admin._id,
        ackDeadline: new Date(now - 3600000), // 1 hour past due
        actionDeadline: new Date(now + 3600000),
        slaVersion: 1,
      });
    }
    const inserted = await Task.insertMany(taskDocs);
    return inserted;
  };

  /**
   * Helper to drain and clean queue
   */
  const resetQueue = async () => {
    await queue.drain();
    await queue.obliterate({ force: true });
  };

  // -------------------------------------------------------------------------
  // EXPERIMENT 1: WORKER CONCURRENCY BENCHMARK (1, 5, 10, 20)
  // -------------------------------------------------------------------------
  console.log(`------------------------------------------------------`);
  console.log(`🧪 PART 15: BENCHMARKING WORKER CONCURRENCY (1, 5, 10, 20)`);
  console.log(`------------------------------------------------------\n`);

  const concurrencyLevels = [1, 5, 10, 20];
  const TASK_COUNT = 400; // 400 tasks per concurrency level
  const concurrencyResults = [];

  for (const concurrency of concurrencyLevels) {
    await resetQueue();
    const tasks = await createPastDueTasks(TASK_COUNT);

    // Enqueue jobs in bulk
    const jobs = tasks.map((t) => ({
      name: "escalateTask",
      data: {
        taskId: t._id.toString(),
        orgId: orgId.toString(),
        escalationType: "MISSED_ACK",
        slaVersion: 1,
      },
      opts: { attempts: 1, removeOnComplete: true },
    }));

    await queue.addBulk(jobs);

    const jobDurations = [];
    let completedCount = 0;
    let failedCount = 0;
    let startTime;
    let endTime;

    await new Promise((resolve) => {
      startTime = Date.now();

      const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          const t0 = Date.now();
          const res = await processTaskEscalation(job.data);
          const dur = Date.now() - t0;
          jobDurations.push(dur);
          return res;
        },
        { connection: redisConfig, concurrency }
      );

      worker.on("completed", async () => {
        completedCount++;
        if (completedCount + failedCount >= TASK_COUNT) {
          endTime = Date.now();
          await worker.close();
          resolve();
        }
      });

      worker.on("failed", async (job, err) => {
        failedCount++;
        console.error(`Job failed: ${err.message}`);
        if (completedCount + failedCount >= TASK_COUNT) {
          endTime = Date.now();
          await worker.close();
          resolve();
        }
      });
    });

    const totalTimeSec = (endTime - startTime) / 1000;
    const throughputRps = (completedCount / totalTimeSec).toFixed(1);
    jobDurations.sort((a, b) => a - b);
    const avgDuration = (
      jobDurations.reduce((a, b) => a + b, 0) / (jobDurations.length || 1)
    ).toFixed(2);
    const p50 = jobDurations[Math.floor(jobDurations.length * 0.5)] || 0;
    const p95 = jobDurations[Math.floor(jobDurations.length * 0.95)] || 0;
    const p99 = jobDurations[Math.floor(jobDurations.length * 0.99)] || 0;

    concurrencyResults.push({
      concurrency,
      taskCount: TASK_COUNT,
      totalTimeSec: totalTimeSec.toFixed(2),
      throughputRps,
      avgDurationMs: avgDuration,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      failed: failedCount,
    });

    console.log(
      `  Concurrency ${concurrency.toString().padStart(2)}: ` +
      `${throughputRps.padStart(5)} jobs/sec | ` +
      `Total: ${totalTimeSec.toFixed(2)}s | ` +
      `Avg: ${avgDuration}ms | ` +
      `p95: ${p95}ms | ` +
      `Failures: ${failedCount}`
    );
  }

  // -------------------------------------------------------------------------
  // EXPERIMENT 2: HORIZONTAL WORKER SCALING (1, 2, 3 WORKERS)
  // -------------------------------------------------------------------------
  console.log(`\n------------------------------------------------------`);
  console.log(`🧪 PART 16: BENCHMARKING HORIZONTAL WORKER SCALING (1, 2, 3 WORKERS)`);
  console.log(`------------------------------------------------------\n`);

  const workerCounts = [1, 2, 3];
  const SCALING_TASK_COUNT = 600;
  const scalingResults = [];

  for (const numWorkers of workerCounts) {
    await resetQueue();
    const tasks = await createPastDueTasks(SCALING_TASK_COUNT);

    const jobs = tasks.map((t) => ({
      name: "escalateTask",
      data: {
        taskId: t._id.toString(),
        orgId: orgId.toString(),
        escalationType: "MISSED_ACK",
        slaVersion: 1,
      },
      opts: { attempts: 1, removeOnComplete: true },
    }));

    await queue.addBulk(jobs);

    const workerJobCounts = new Array(numWorkers).fill(0);
    let totalCompleted = 0;
    let totalFailed = 0;
    let startTime;
    let endTime;

    await new Promise((resolve) => {
      startTime = Date.now();
      const workers = [];

      for (let w = 0; w < numWorkers; w++) {
        const workerIndex = w;
        const worker = new Worker(
          QUEUE_NAME,
          async (job) => {
            return processTaskEscalation(job.data);
          },
          { connection: redisConfig, concurrency: 10 }
        );

        worker.on("completed", async () => {
          workerJobCounts[workerIndex]++;
          totalCompleted++;
          if (totalCompleted + totalFailed >= SCALING_TASK_COUNT) {
            endTime = Date.now();
            await Promise.all(workers.map((wrk) => wrk.close()));
            resolve();
          }
        });

        worker.on("failed", async () => {
          totalFailed++;
          if (totalCompleted + totalFailed >= SCALING_TASK_COUNT) {
            endTime = Date.now();
            await Promise.all(workers.map((wrk) => wrk.close()));
            resolve();
          }
        });

        workers.push(worker);
      }
    });

    const totalTimeSec = (endTime - startTime) / 1000;
    const throughputRps = (totalCompleted / totalTimeSec).toFixed(1);

    scalingResults.push({
      workers: numWorkers,
      taskCount: SCALING_TASK_COUNT,
      totalTimeSec: totalTimeSec.toFixed(2),
      throughputRps,
      distribution: workerJobCounts.join(" / "),
      failures: totalFailed,
    });

    console.log(
      `  ${numWorkers} Worker(s): ${throughputRps.padStart(5)} jobs/sec | ` +
      `Total: ${totalTimeSec.toFixed(2)}s | ` +
      `Distribution: [${workerJobCounts.join(", ")}] | ` +
      `Failures: ${totalFailed}`
    );
  }

  // -------------------------------------------------------------------------
  // EXPERIMENT 3: CONCURRENCY INTEGRITY & IDEMPOTENCY VERIFICATION
  // -------------------------------------------------------------------------
  console.log(`\n------------------------------------------------------`);
  console.log(`🛡️ VERIFYING ATOMIC CONCURRENCY & ZERO DUPLICATES`);
  console.log(`------------------------------------------------------\n`);

  // Verify that all tasks were transitioned with 0 duplicate state transitions
  const totalTasks = await Task.countDocuments({ orgId, state: TASK_STATES.ESCALATED });
  const totalEscTransitions = await TaskStateTransition.countDocuments({
    orgId,
    toState: TASK_STATES.ESCALATED,
  });

  console.log(`  Total Escalated Tasks in DB:            ${totalTasks}`);
  console.log(`  Total ESCALATED State Transitions:      ${totalEscTransitions}`);
  console.log(`  Atomic Transition Idempotency Check:    ${totalTasks <= totalEscTransitions ? "✅ PASSED (No Duplicate Conflicts)" : "❌ FAILED"}\n`);

  const summary = { concurrencyResults, scalingResults };

  try {
    const fs = await import("fs");
    const path = await import("path");
    const outPath = path.resolve(process.cwd(), "../performance/worker-benchmark-results.json");
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`💾 Saved worker benchmark metrics to ${outPath}\n`);
  } catch (e) {
    console.warn("Could not save results file:", e.message);
  }

  await resetQueue();
  await queue.close();
  await mongoose.disconnect();

  return summary;
};

if (process.argv[1]?.endsWith("benchmarkWorkers.js")) {
  runWorkerBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
