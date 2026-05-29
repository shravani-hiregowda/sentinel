import { escalateMissedAckTasks } from "../services/escalationService.js";

export const startAckEscalationJob = () => {
  console.log("🕒 ACK escalation job started (runs every 30 seconds)");

  setInterval(async () => {
    try {
      const result = await escalateMissedAckTasks();
      if (result.escalatedCount > 0) {
        console.log(`✅ Escalated ${result.escalatedCount} missed-ACK tasks`);
      }
    } catch (err) {
      console.error("❌ ACK Escalation job error:", err.message);
    }
  }, 30 * 1000); // every 30 seconds
};
