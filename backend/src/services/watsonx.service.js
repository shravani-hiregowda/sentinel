import env from "../config/env.js";
import logger from "../utils/logger.js";
import { AI_TOOL_DEFINITIONS, executeAiTool } from "./aiTools.service.js";
import {
  recordAiRequest,
  recordAiRequestFailure,
} from "../metrics/metrics.js";

// Cached IAM access token state
let cachedIamToken = null;
let iamTokenExpiry = 0;

/**
 * Exchange IBM Cloud API Key for an IAM Bearer access token.
 * Caches the token in-memory until 5 minutes before expiration.
 *
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export const getIamToken = async (apiKey) => {
  const now = Date.now();
  if (cachedIamToken && now < iamTokenExpiry - 300000) {
    return cachedIamToken;
  }

  const params = new URLSearchParams({
    grant_type: "urn:ibm:params:oauth:grant-type:apikey",
    apikey: apiKey,
  });

  const response = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown");
    throw new Error(`IBM IAM authentication failed (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedIamToken = data.access_token;
  iamTokenExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedIamToken;
};

/**
 * Build the system prompt enforcing strict governance, multi-tenant grounding,
 * and zero hallucination.
 */
export const buildSystemPrompt = () => {
  return [
    "You are the Sentinel AI Operations Assistant for a secure multi-tenant governance platform.",
    "Your role is to help authorized users query their organization's tasks, analyze SLA performance, and perform safe actions.",
    "",
    "STRICT SECURITY & GOVERNANCE RULES:",
    "1. Only answer using real data returned from Sentinel tools. Never invent or hallucinate task IDs, names, metrics, or states.",
    "2. If a tool returns no data or an empty list, explicitly state: 'No matching data was found in your organization.'",
    "3. You cannot access data outside the user's current organization. Tenant boundaries are strictly enforced.",
    "4. For task creation, acknowledgment, or SLA queries, invoke the appropriate Sentinel tool.",
    "5. Format responses clearly with concise bullet points and bold headers.",
  ].join("\n");
};

/**
 * Deterministic intent parser used in offline mode, testing, or as a zero-dependency fallback.
 * Exercises the exact same tool execution pipeline and produces real database-grounded answers.
 *
 * @param {string} prompt
 * @param {Object} ctx
 * @returns {Promise<{ toolCalls: Array, answer: string }>}
 */
export const runFallbackIntentEngine = async (prompt, ctx) => {
  const p = prompt.toLowerCase();
  const toolCalls = [];
  let answer = "";

  // 1. Task Creation intent
  if (p.includes("create task") || p.includes("create a task") || p.includes("new task")) {
    // Extract title if present in quotes or after colon
    const titleMatch = prompt.match(/["']([^"']+)["']/) || prompt.match(/(?:title|task)[:\s]+([^,.]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : "New Governance Task";

    // Extract owner
    const ownerMatch = prompt.match(/(?:for|to|assign to)\s+([A-Za-z0-9@._-]+)/i);
    const owner = ownerMatch ? ownerMatch[1] : (ctx.user ? ctx.user.name : "Unassigned");

    // Extract SLA hours
    const ackMatch = prompt.match(/(\d+)\s*(?:h|hour|hours?)\s*(?:ack|acknowledgment|sla)/i);
    const actionMatch = prompt.match(/(\d+)\s*(?:h|hour|hours?)\s*(?:action|resolution|completion)/i);

    const toolArgs = {
      title,
      ownerEmailOrName: owner,
      ackHours: ackMatch ? parseInt(ackMatch[1], 10) : 4,
      actionHours: actionMatch ? parseInt(actionMatch[1], 10) : 24,
    };

    toolCalls.push({ name: "createTask", arguments: toolArgs });
    const result = await executeAiTool("createTask", toolArgs, ctx);

    if (result.success) {
      answer = `✅ Task created successfully:\n• **Title:** ${result.task.title}\n• **Assigned to:** ${result.task.owner}\n• **State:** ${result.task.state}\n• **ACK Deadline:** ${new Date(result.task.ackDeadline).toLocaleString()}\n• **Action Deadline:** ${new Date(result.task.actionDeadline).toLocaleString()}`;
    } else {
      answer = `❌ Could not create task: ${result.error || "Permission denied or invalid parameters."}`;
    }
    return { toolCalls, answer };
  }

  // 2. Acknowledge task intent
  if (p.includes("acknowledge") || p.includes("ack task")) {
    const idMatch = prompt.match(/[0-9a-fA-F]{24}/);
    if (!idMatch) {
      return {
        toolCalls: [],
        answer: "Please provide the valid 24-character hexadecimal ID of the task you wish to acknowledge.",
      };
    }
    const toolArgs = { taskId: idMatch[0] };
    toolCalls.push({ name: "acknowledgeTask", arguments: toolArgs });
    const result = await executeAiTool("acknowledgeTask", toolArgs, ctx);

    if (result.success) {
      answer = `✅ ${result.message}\n• **Task ID:** ${result.task.id}\n• **Current State:** ${result.task.state}`;
    } else {
      answer = `❌ Could not acknowledge task: ${result.error}`;
    }
    return { toolCalls, answer };
  }

  // 3. Overdue tasks query
  if (p.includes("overdue") || p.includes("deadline")) {
    toolCalls.push({ name: "getOverdueTasks", arguments: { limit: 20 } });
    const result = await executeAiTool("getOverdueTasks", { limit: 20 }, ctx);

    if (result.totalOverdue === 0) {
      answer = "🎉 Great news! There are currently **0 overdue tasks** in your organization.";
    } else {
      const ackList = result.missedAcknowledgment.map((t) => `• [${t.id}] **${t.title}** (Owner: ${t.owner}) - ACK deadline missed on ${new Date(t.ackDeadline).toLocaleString()}`).join("\n");
      const actionList = result.missedResolution.map((t) => `• [${t.id}] **${t.title}** (Owner: ${t.owner}) - Action deadline missed on ${new Date(t.actionDeadline).toLocaleString()}`).join("\n");

      answer = `⚠️ Found **${result.totalOverdue} overdue task(s)** in your organization:\n\n` +
        (result.missedAcknowledgment.length > 0 ? `**Missed Acknowledgment:**\n${ackList}\n\n` : "") +
        (result.missedResolution.length > 0 ? `**Missed Resolution:**\n${actionList}` : "");
    }
    return { toolCalls, answer };
  }

  // 4. Escalated tasks query
  if (p.includes("escalat")) {
    // If specific task details or history requested
    const idMatch = prompt.match(/[0-9a-fA-F]{24}/);
    if (idMatch && (p.includes("why") || p.includes("reason") || p.includes("history"))) {
      toolCalls.push({ name: "getTaskSLAHistory", arguments: { taskId: idMatch[0] } });
      const history = await executeAiTool("getTaskSLAHistory", { taskId: idMatch[0] }, ctx);

      if (!history.found) {
        answer = `Task ${idMatch[0]} was not found in your organization.`;
      } else {
        const escalations = history.escalations.length > 0
          ? history.escalations.map((e) => `• Reason: **${e.reason}** (${e.notes}) at ${new Date(e.timestamp).toLocaleString()}`).join("\n")
          : "No recorded escalation events.";
        answer = `📊 **SLA History for ${history.task.title}** [${history.task.id}]:\n• **Current State:** ${history.task.state}\n\n**Escalation Events:**\n${escalations}`;
      }
      return { toolCalls, answer };
    }

    toolCalls.push({ name: "getEscalatedTasks", arguments: { limit: 20 } });
    const result = await executeAiTool("getEscalatedTasks", { limit: 20 }, ctx);

    if (result.count === 0) {
      answer = "✅ There are currently **no escalated tasks** in your organization.";
    } else {
      const list = result.escalatedTasks.map((t) => `• **${t.title}** (Owner: ${t.owner}) - Escalated: ${new Date(t.escalatedAt).toLocaleString()}\n  *Reason:* ${t.reason} (${t.notes})`).join("\n");
      answer = `🚨 Found **${result.count} escalated task(s)** in your organization:\n\n${list}`;
    }
    return { toolCalls, answer };
  }

  // 5. Team / Member performance query
  if (p.includes("team") || p.includes("performance") || p.includes("member")) {
    toolCalls.push({ name: "getTeamPerformance", arguments: {} });
    const result = await executeAiTool("getTeamPerformance", {}, ctx);

    if (result.totalMembers === 0) {
      answer = "No active team members found in your organization.";
    } else {
      const rows = result.memberPerformance.map((m) => `• **${m.name}** (${m.email}): ${m.totalAssigned} assigned | ${m.completed} completed (${m.completionRate}) | ${m.escalationsCaused} escalations`).join("\n");
      answer = `📈 **Team SLA Performance Summary (${result.totalMembers} members):**\n\n${rows}`;
    }
    return { toolCalls, answer };
  }

  // 6. SLA analysis / violation inquiry
  if (p.includes("sla") || p.includes("violation")) {
    toolCalls.push({ name: "getOverdueTasks", arguments: { limit: 20 } });
    toolCalls.push({ name: "getEscalatedTasks", arguments: { limit: 20 } });

    const [overdue, escalated] = await Promise.all([
      executeAiTool("getOverdueTasks", { limit: 20 }, ctx),
      executeAiTool("getEscalatedTasks", { limit: 20 }, ctx),
    ]);

    answer = `📋 **Organization SLA Health Report:**\n• **Active SLA Breaches:** ${overdue.totalOverdue} task(s) currently past deadline\n• **Escalated Tasks:** ${escalated.count} task(s) escalated by background workers\n\n` +
      (escalated.count > 0 ? `Latest Escalation: "${escalated.escalatedTasks[0]?.title}" (${escalated.escalatedTasks[0]?.reason})` : "All systems adhering to defined SLA thresholds.");
    return { toolCalls, answer };
  }

  // 7. General tasks query
  let stateFilter = null;
  if (p.includes("open")) stateFilter = "OPEN";
  if (p.includes("in progress") || p.includes("in-progress")) stateFilter = "IN_PROGRESS";
  if (p.includes("acknowledged")) stateFilter = "ACKNOWLEDGED";
  if (p.includes("closed") || p.includes("completed")) stateFilter = "CLOSED";

  toolCalls.push({ name: "getTasks", arguments: { state: stateFilter, limit: 15 } });
  const result = await executeAiTool("getTasks", { state: stateFilter, limit: 15 }, ctx);

  if (result.count === 0) {
    answer = `No ${stateFilter ? stateFilter.toLowerCase() + " " : ""}tasks found in your organization.`;
  } else {
    const list = result.tasks.map((t) => `• [${t.id.slice(-6)}] **${t.title}** — State: \`${t.state}\` (Owner: ${t.owner?.name || "Unassigned"})`).join("\n");
    answer = `📋 Found **${result.count} task(s)**${stateFilter ? ` in state \`${stateFilter}\`` : ""}:\n\n${list}`;
  }

  return { toolCalls, answer };
};

/**
 * Execute a conversation turn with IBM watsonx.ai Chat Completions.
 *
 * Implements the full agentic tool-calling loop:
 * 1. Invokes /ml/v1/chat/completions with tools definitions.
 * 2. If watsonx requests function calling, runs allowlisted executeAiTool().
 * 3. Sends tool results back to watsonx to produce a grounded natural-language answer.
 * 4. Fails safely if IBM watsonx is unreachable.
 *
 * @param {Object} params
 * @param {string} params.prompt - Current user prompt
 * @param {Array} [params.messages=[]] - Prior conversation turns
 * @param {Object} params.ctx - Authenticated tenant context
 * @returns {Promise<{ message: string, toolCalls: Array, model: string }>}
 */
export const chatWithWatsonx = async ({ prompt, messages = [], ctx }) => {
  const startTime = performance.now();
  const apiKey = env.IBM_WATSONX_API_KEY;
  const projectId = env.IBM_WATSONX_PROJECT_ID;

  // If IBM Cloud credentials are not configured or in unit test mode, use deterministic intent engine
  if (!apiKey || !projectId || env.isTest) {
    try {
      const { toolCalls, answer } = await runFallbackIntentEngine(prompt, ctx);
      const durationSec = (performance.now() - startTime) / 1000;
      recordAiRequest("success", durationSec);

      return {
        message: answer,
        toolCalls,
        model: env.isTest ? "sentinel-watsonx-mock" : "sentinel-watsonx-local",
      };
    } catch (err) {
      recordAiRequestFailure("FALLBACK_ERROR");
      throw err;
    }
  }

  // Production IBM watsonx.ai Chat Completions Flow
  try {
    const iamToken = await getIamToken(apiKey);
    const endpoint = `${env.IBM_WATSONX_URL}/ml/v1/chat/completions?version=${env.IBM_WATSONX_API_VERSION}`;

    const conversation = [
      { role: "system", content: buildSystemPrompt() },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: prompt },
    ];

    const initialPayload = {
      project_id: projectId,
      model_id: env.IBM_WATSONX_MODEL_ID,
      messages: conversation,
      tools: AI_TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.1,
    };

    logger.debug("Dispatching request to IBM watsonx.ai Chat API", {
      endpoint,
      model: env.IBM_WATSONX_MODEL_ID,
      requestId: ctx.requestId,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${iamToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(initialPayload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      logger.error("IBM watsonx.ai API returned error status", {
        status: response.status,
        error: errText,
        requestId: ctx.requestId,
      });
      throw new Error(`IBM watsonx.ai service returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      throw new Error("IBM watsonx.ai returned an empty response");
    }

    const executedToolCalls = [];

    // Handle Function / Tool calling
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      conversation.push(assistantMessage);

      for (const call of assistantMessage.tool_calls) {
        const toolName = call.function?.name;
        let toolArgs = {};
        try {
          toolArgs = typeof call.function?.arguments === "string"
            ? JSON.parse(call.function.arguments)
            : call.function?.arguments || {};
        } catch {
          toolArgs = {};
        }

        const toolResult = await executeAiTool(toolName, toolArgs, ctx);
        executedToolCalls.push({ name: toolName, arguments: toolArgs, result: toolResult });

        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: JSON.stringify(toolResult),
        });
      }

      // Second turn: request final answer based on real tool output
      const followUpPayload = {
        project_id: projectId,
        model_id: env.IBM_WATSONX_MODEL_ID,
        messages: conversation,
        max_tokens: 1024,
        temperature: 0.1,
      };

      const followUpResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${iamToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(followUpPayload),
      });

      if (!followUpResponse.ok) {
        const errText = await followUpResponse.text().catch(() => "Unknown error");
        throw new Error(`IBM watsonx.ai synthesis failed (HTTP ${followUpResponse.status}): ${errText}`);
      }

      const followUpData = await followUpResponse.json();
      const finalMessage = followUpData.choices?.[0]?.message?.content || "Operation completed successfully.";

      const durationSec = (performance.now() - startTime) / 1000;
      recordAiRequest("success", durationSec);

      return {
        message: finalMessage,
        toolCalls: executedToolCalls,
        model: env.IBM_WATSONX_MODEL_ID,
      };
    }

    const durationSec = (performance.now() - startTime) / 1000;
    recordAiRequest("success", durationSec);

    return {
      message: assistantMessage.content || "No response received.",
      toolCalls: [],
      model: env.IBM_WATSONX_MODEL_ID,
    };
  } catch (error) {
    const durationSec = (performance.now() - startTime) / 1000;
    recordAiRequest("error", durationSec);
    recordAiRequestFailure("PROVIDER_ERROR");

    logger.error("IBM watsonx service exception caught", {
      event: "ai.provider.error",
      message: error.message,
      requestId: ctx.requestId,
    });

    // Graceful error contract: ensure user receives helpful status without crashing application
    throw error;
  }
};

export default {
  chatWithWatsonx,
  getIamToken,
  buildSystemPrompt,
  runFallbackIntentEngine,
};
