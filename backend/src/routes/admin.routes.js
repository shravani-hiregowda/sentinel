import express from "express";
import { reassignTask } from "../controllers/admin.controller.js";
import {
  listTasksForAdmin,
  updateTaskStateAdmin,
} from "../controllers/adminTasks.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { attachTenantContext } from "../middlewares/org.middleware.js";
import { adminOnly } from "../middlewares/role.middleware.js";
import {
  validateObjectIdParam,
  validateReassignTask,
  validateStateTransition,
  validateAdminTaskQuery,
} from "../middlewares/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.use(attachTenantContext);
router.use(adminOnly);

router.get("/ping", (req, res) => {
  res.json({
    message: "Admin routes working",
  });
});

// Admin reassign task
router.post(
  "/tasks/:taskId/reassign",
  validateObjectIdParam("taskId"),
  validateReassignTask,
  reassignTask
);

// List tasks with admin filters & validated query pagination
router.get("/tasks", validateAdminTaskQuery, listTasksForAdmin);

// Force update task state
router.put(
  "/tasks/:id/state",
  validateObjectIdParam("id"),
  validateStateTransition,
  updateTaskStateAdmin
);

export default router;
