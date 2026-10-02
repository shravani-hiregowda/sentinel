import { chatWithWatsonx } from "../services/watsonx.service.js";
import logger from "../utils/logger.js";

/**
 * Handle natural language conversation turn with Sentinel AI Assistant.
 *
 * Enforces:
 * 1. Authenticated user context (req.user)
 * 2. Trusted tenant isolation context (req.orgId)
 * 3. Structured observability and correlation tracking
 * 4. Safe failure isolation so third-party AI outages never degrade Sentinel core APIs
 */
export const chatWithAssistant = async (req, res, _next) => {
  const requestId = req.id || req.requestId;
  const { prompt, messages = [] } = req.body;

  try {
    const ctx = {
      orgId: req.orgId,
      user: req.user,
      requestId,
    };

    logger.info("Processing Sentinel AI Assistant chat request", {
      event: "ai.chat.request",
      orgId: req.orgId.toString(),
      userId: req.user._id.toString(),
      userRole: req.user.role,
      promptLength: prompt ? prompt.length : 0,
      requestId,
    });

    const result = await chatWithWatsonx({
      prompt: prompt || (messages.length > 0 ? messages[messages.length - 1].content : ""),
      messages,
      ctx,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      toolCalls: result.toolCalls,
      model: result.model,
      requestId,
    });
  } catch (error) {
    logger.error("AI Assistant request failed", {
      event: "ai.chat.failure",
      error: error.message,
      orgId: req.orgId?.toString(),
      userId: req.user?._id?.toString(),
      requestId,
    });

    // If external AI provider fails, return HTTP 503 Service Unavailable with friendly explanation
    // ensuring core application is understood to be completely healthy
    res.status(503).json({
      success: false,
      message: "The AI Operations Assistant is temporarily unavailable. Core Sentinel task governance and SLA tracking remain fully operational.",
      error: {
        code: "AI_PROVIDER_UNAVAILABLE",
        message: error.message || "Failed to communicate with AI provider",
        ...(requestId ? { requestId } : {}),
      },
      ...(requestId ? { requestId } : {}),
    });
  }
};

export default {
  chatWithAssistant,
};
