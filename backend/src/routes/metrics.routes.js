import express from "express";
import { register, updateQueueMetrics } from "../metrics/metrics.js";
import { getEscalationQueue } from "../queues/escalation.queue.js";

const router = express.Router();

/**
 * GET /metrics
 * Exposes Prometheus-compatible operational, HTTP, business, worker, and queue metrics.
 * Ensures zero leakage of tenant, user, or sensitive business data.
 */
router.get("/", async (req, res, next) => {
  try {
    try {
      const queue = getEscalationQueue();
      await updateQueueMetrics(queue);
    } catch {
      // Allow scrape to proceed even if queue stats temporarily fail
    }

    res.setHeader("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.status(200).send(metrics);
  } catch (err) {
    next(err);
  }
});

export default router;
