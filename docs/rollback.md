# Sentinel — Production Rollback Strategy & Playbook

## 1. Overview

In the event of an undetected regression, elevated error rate, or performance degradation following a production release, operations teams must execute a controlled, deterministic rollback.

```text
               NEW DEPLOYMENT (Git SHA: 7a8b9c)
                              │
                              ▼
                   AUTOMATED SMOKE TEST
                              │
                     [ FAILED / CRITICAL ]
                              │
                              ▼
                  1. HALT TRAFFIC SHIFTING
                              │
                              ▼
             2. RE-DEPLOY PREVIOUS ARTIFACT (SHA: 1e2f3a)
                              │
                              ▼
           3. VERIFY READINESS & WORKER INTEGRITY
                              │
                              ▼
          4. INVALIDATE AFFECTED REDIS TENANT CACHES
                              │
                              ▼
                  5. INCIDENT POST-MORTEM
```

---

## 2. Fast Image Rollback Procedure

Because Sentinel images are tagged with immutable Git commit SHAs, rolling back code requires reverting the deployed image tag:

### 2.1 Docker Compose Environment
```bash
# 1. Update the image tag in your deployment environment or .env file
export IMAGE_TAG="<PREVIOUS_STABLE_GIT_SHA>"

# 2. Re-create API, Worker, and Frontend containers with previous image
docker compose up -d --no-build api worker frontend

# 3. Verify health and readiness
curl -f http://localhost:5000/health
curl -f http://localhost:5000/ready
```

### 2.2 Kubernetes Environment
```bash
# 1. Roll back the deployment to the previous revision
kubectl rollout undo deployment/sentinel-api -n production
kubectl rollout undo deployment/sentinel-worker -n production
kubectl rollout undo deployment/sentinel-frontend -n production

# 2. Monitor rollback status
kubectl rollout status deployment/sentinel-api -n production
```

### 2.3 AWS ECS (Fargate) Environment
```bash
# Update service with previous stable Task Definition revision
aws ecs update-service \
  --cluster sentinel-prod-cluster \
  --service sentinel-api \
  --task-definition sentinel-api:42

aws ecs update-service \
  --cluster sentinel-prod-cluster \
  --service sentinel-worker \
  --task-definition sentinel-worker:42
```

---

## 3. Database Migration & Schema Compatibility Principles

> [!IMPORTANT]
> **Expand-Contract (Parallel Run) Principle**: Never introduce breaking, backward-incompatible schema changes in a single release. 

### Why Database Rollbacks Must Not Drop Data
1. Reverting an application image does **NOT** automatically revert database modifications.
2. Dropping collections or deleting columns during an incident risks catastrophic data loss.

### Safe Migration Rules
1. **Additive Changes Only**: Add new fields with defaults or optional values. Old application versions can safely ignore unrecognized fields.
2. **Indexes are Non-Destructive**: Compound indexes created by `npm run db:init-indexes` do not modify underlying data. Even if code is rolled back, the compound index remains valid and continues to accelerate queries.
3. **Index Removal Procedure**: If a newly created index causes unexpected write latency, remove it explicitly using `mongosh`:
   ```javascript
   db.tasks.dropIndex("unintended_index_name");
   ```

---

## 4. BullMQ Queue & Worker State During Rollback

Sentinel’s BullMQ architecture was explicitly designed to survive worker restarts, pauses, and rollbacks without duplicate execution:

### 4.1 In-Flight & Delayed Jobs
- **Delayed SLA Jobs**: Overdue escalations waiting in Redis remain in the delayed or waiting set. They are not destroyed during container recreation.
- **In-Flight Jobs**: When the worker receives `SIGTERM`, graceful shutdown permits active jobs up to `SHUTDOWN_TIMEOUT_MS` (10s) to finish before process termination.
- **Lock Renewal / Stalled Jobs**: If a worker abruptly crashes, BullMQ detects the stalled lock after 30 seconds and safely returns the job to the waiting queue for another worker.

### 4.2 Stale Job & Idempotency Safeguards
Even if a rolled-back worker picks up a job scheduled by a newer version:
- The worker executes `processTaskEscalation(job.data)`.
- It loads the task from MongoDB and verifies `task.slaVersion === job.data.slaVersion`.
- If the task was already completed or transitioned, the worker marks the job as an idempotent no-op and exits cleanly.
- **Zero duplicate transitions or notifications are emitted.**

---

## 5. Cache Invalidation Post-Rollback

If an unreleased bug corrupted or cached unexpected payloads in Redis, flush the tenant cache without disturbing the BullMQ queue:

```bash
# Option A: Invalidate tenant dashboard caches specifically (via Redis CLI)
# Scans and deletes org:*:dashboard:* keys without affecting BullMQ queues
redis-cli --scan --pattern "org:*:dashboard:*" | xargs -r redis-cli del

# Option B: Selective Invalidation via Application Service
# Run in Node CLI or admin route to purge specific tenant caches
```
> [!CAUTION]
> Never run `FLUSHALL` in a shared Redis instance, as this would erase active BullMQ SLA escalation queues and rate limit counters.
