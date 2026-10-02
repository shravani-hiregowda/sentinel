import express from "express";
import {
  getDashboardSummary,
  getEscalatedTasks,
  getOverdueTasks,
  getMemberPerformance,
  getActivityFeed,
} from "../controllers/dashboard.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { attachTenantContext } from "../middlewares/org.middleware.js";
import { adminOnly } from "../middlewares/role.middleware.js";

const router = express.Router();

router.use(protect);
router.use(attachTenantContext);
router.use(adminOnly);

router.get("/summary", getDashboardSummary);
router.get("/escalated", getEscalatedTasks);
router.get("/overdue", getOverdueTasks);
router.get("/members", getMemberPerformance);
router.get("/activity", getActivityFeed);

export default router;
