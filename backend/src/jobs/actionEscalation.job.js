/**
 * @deprecated Deprecated in Phase 2.
 * Sentinel SLA escalation processing has been migrated to the distributed
 * BullMQ worker architecture (`src/workers/escalation.worker.js`).
 *
 * In-process setInterval polling is permanently discontinued to ensure
 * reliable horizontal scaling, idempotency, and eliminate duplicate escalations.
 */
export const startActionEscalationJob = () => {
  console.warn(
    "⚠️ startActionEscalationJob is deprecated. Start `npm run worker` for SLA processing."
  );
};

export default startActionEscalationJob;
