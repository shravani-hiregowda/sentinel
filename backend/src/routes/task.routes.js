import express from "express";
import {
  createTask,
  acknowledgeTask,
  completeTask,
  startTask,
  getTaskTimeline,
  getTasksByOwner,
  getMyTasks,
} from "../controllers/task.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/my", protect, getMyTasks);
router.get("/owner/:ownerId", protect, getTasksByOwner);
router.post("/", protect, createTask);
router.post("/:id/ack", protect, acknowledgeTask);
router.post("/:id/start", protect, startTask);
router.post("/:id/complete", protect, completeTask);
router.get("/:id/timeline", protect, getTaskTimeline);



export default router;
