import { escalateMissedActionTasks } from "../services/escalationService.js";

export const startActionEscalationJob = () => {
  console.log("🕒 Action escalation job started (runs every 30 seconds)");

  setInterval(async () => {
    try {
      const result = await escalateMissedActionTasks();
      if (result.escalatedCount > 0) {
        console.log(`✅ Escalated ${result.escalatedCount} missed-action tasks`);
      }
    } catch (err) {
      console.error("❌ Action Escalation job error:", err.message);
    }
  }, 30 * 1000);
};
