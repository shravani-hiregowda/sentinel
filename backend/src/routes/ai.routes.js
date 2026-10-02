import express from "express";
import { chatWithAssistant } from "../controllers/ai.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { attachTenantContext } from "../middlewares/org.middleware.js";
import { aiRateLimiter } from "../middlewares/rateLimit.middleware.js";
import { validateAiChat } from "../middlewares/validate.middleware.js";

const router = express.Router();

/**
 * POST /api/ai/chat
 * Primary entry point for natural language interaction with Sentinel AI Assistant.
 *
 * Security Pipeline:
 * 1. protect -> Validates JWT, extracts active user
 * 2. attachTenantContext -> Extracts and binds trusted req.orgId (preventing any org spoofing)
 * 3. aiRateLimiter -> Enforces AI-specific rate limiting per user/IP
 * 4. validateAiChat -> Validates presence and bounds of prompt/messages payload
 * 5. chatWithAssistant -> Dispatches to watsonx service with allowlisted tools
 */
router.post(
  "/chat",
  protect,
  attachTenantContext,
  aiRateLimiter,
  validateAiChat,
  chatWithAssistant
);

export default router;
