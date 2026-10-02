import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import connectDB from "../config/db.js";
import { getRedisConfig } from "../config/redis.js";
import { ESCALATION_QUEUE_NAME } from "../queues/escalation.queue.js";
import { processTaskEscalation } from "../services/escalationService.js";
import logger from "../utils/logger.js";
import { recordWorkerJob, recordWorkerJobFailure } from "../metrics/metrics.js";
import { setupWorkerGracefulShutdown } from "../utils/shutdown.js";

/**
 * Creates and initializes a standalone BullMQ SLA escalation worker.
 *
 * @param {Object} [options]
 * @param {number} [options.concurrency=5]
 * @returns {Worker}
 */
export const createEscalationWorker = (options = {}) => {
  const connection = getRedisConfig();
  const workerLogger = logger.child({
    service: "sentinel-worker",
    queue: ESCALATION_QUEUE_NAME,
  });

  const worker = new Worker(
    ESCALATION_QUEUE_NAME,
    async (job) => {
      const startTime = process.hrtime.bigint();
      workerLogger.info("Job processing started", {
        event: "worker.job_start",
        jobId: job.id,
        taskId: job.data?.taskId,
        orgId: job.data?.orgId,
        slaVersion: job.data?.slaVersion,
        escalationType: job.data?.escalationType,
        attempt: job.attemptsMade + 1,
      });

      try {
        const result = await processTaskEscalation(job.data);
        const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
        recordWorkerJob(ESCALATION_QUEUE_NAME, "success", durationSec);
        return result;
      } catch (err) {
        const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
        recordWorkerJob(ESCALATION_QUEUE_NAME, "error", durationSec);
        throw err;
      }
    },
    {
      connection,
      concurrency: options.concurrency || 5,
      ...options,
    }
  );

  worker.on("completed", (job, result) => {
    workerLogger.info("Job processing completed", {
      event: "worker.job_complete",
      jobId: job.id,
      taskId: job.data?.taskId,
      orgId: job.data?.orgId,
      result,
    });
  });

  worker.on("failed", (job, err) => {
    recordWorkerJobFailure(ESCALATION_QUEUE_NAME);
    workerLogger.error("Job processing failed", {
      event: "worker.job_failed",
      jobId: job?.id,
      taskId: job?.data?.taskId,
      orgId: job?.data?.orgId,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: { message: err.message, stack: err.stack },
    });
  });

  worker.on("error", (err) => {
    workerLogger.error("Critical BullMQ Worker Error", {
      event: "worker.error",
      error: { message: err.message, stack: err.stack },
    });
  });

  return worker;
};

/**
 * CLI Entry point when worker is run directly (e.g. `npm run worker`)
 */
const startStandaloneWorker = async () => {
  try {
    logger.info("🚀 Starting standalone Sentinel SLA Escalation Worker...", {
      service: "sentinel-worker",
    });
    await connectDB();

    const worker = createEscalationWorker();
    logger.info(`🛡️ SLA Escalation Worker is running on queue "${ESCALATION_QUEUE_NAME}"`, {
      service: "sentinel-worker",
      queue: ESCALATION_QUEUE_NAME,
    });

    // Graceful shutdown handling
    setupWorkerGracefulShutdown(worker);
  } catch (error) {
    logger.error("❌ Fatal error starting escalation worker", {
      service: "sentinel-worker",
      error: { message: error.message, stack: error.stack },
    });
    process.exit(1);
  }
};

// Auto-run if executed directly as script
if (process.argv[1]?.endsWith("escalation.worker.js")) {
  startStandaloneWorker();
}

export default createEscalationWorker;
