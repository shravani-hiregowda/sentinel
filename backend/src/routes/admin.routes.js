import express from "express";
import { reassignTask } from "../controllers/admin.controller.js";
import { listTasksForAdmin, updateTaskStateAdmin } from "../controllers/adminTasks.controller.js";
import { protect, adminOnly } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get("/ping", (req, res) => {
  res.json({
    message: "Admin routes working",
  });
});

// Admin reassign task
router.post("/tasks/:taskId/reassign", reassignTask);

// List tasks with admin filters
router.get("/tasks", listTasksForAdmin);

// Force update task state
router.put("/tasks/:id/state", updateTaskStateAdmin);


export default router;
