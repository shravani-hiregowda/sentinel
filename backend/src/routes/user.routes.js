import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { attachTenantContext } from "../middlewares/org.middleware.js";
import { adminOnly } from "../middlewares/role.middleware.js";
import { createMember, changePassword } from "../controllers/user.controller.js";
import { validateCreateMember } from "../middlewares/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.use(attachTenantContext);

// Admin creates MEMBER
router.post("/create-member", adminOnly, validateCreateMember, createMember);

// Logged-in user changes own password
router.patch("/change-password", changePassword);

export default router;
