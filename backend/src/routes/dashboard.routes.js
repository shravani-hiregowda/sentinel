import express from "express";
import {
  getDashboardSummary,
  getEscalatedTasks,
  getOverdueTasks,
  getMemberPerformance,
  getActivityFeed,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/summary", getDashboardSummary);
router.get("/escalated", getEscalatedTasks);
router.get("/overdue", getOverdueTasks);
router.get("/members", getMemberPerformance);
router.get("/activity", getActivityFeed);


export default router;
