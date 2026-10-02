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
import { attachTenantContext } from "../middlewares/org.middleware.js";
import { adminOnly } from "../middlewares/role.middleware.js";
import {
  validateCreateTask,
  validateObjectIdParam,
} from "../middlewares/validate.middleware.js";

const router = express.Router();

// All task routes require authentication and tenant context
router.use(protect);
router.use(attachTenantContext);

router.get("/my", getMyTasks);
router.get("/owner/:ownerId", validateObjectIdParam("ownerId"), getTasksByOwner);
router.post("/", adminOnly, validateCreateTask, createTask);
router.post("/:id/ack", validateObjectIdParam("id"), acknowledgeTask);
router.post("/:id/start", validateObjectIdParam("id"), startTask);
router.post("/:id/complete", validateObjectIdParam("id"), completeTask);
router.get("/:id/timeline", validateObjectIdParam("id"), getTaskTimeline);

export default router;
