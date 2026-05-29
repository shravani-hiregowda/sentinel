import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware.js";
import { createMember, changePassword } from "../controllers/user.controller.js"; // ✅ FIX

const router = express.Router();

// ✅ Admin creates MEMBER
router.post("/create-member", protect, adminOnly, createMember);

// ✅ Logged-in user changes own password
router.patch("/change-password", protect, changePassword);

export default router;
