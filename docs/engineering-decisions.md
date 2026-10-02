# Sentinel — Engineering Decisions & Architectural Trade-offs

This document records the 18 architectural decisions made in Sentinel. Each record outlines the problem context, chosen approach, considered alternatives, and engineering trade-offs.

---

## 1. Why MongoDB?
- **Problem**: Multi-tenant task governance requires polymorphic metadata, flexible task descriptions, embedded arrays for tags/events, and high-frequency document writes.
- **Chosen Approach**: MongoDB 7.0+ as the primary document store using a logical multi-tenancy model with compound indexing on `{ orgId: 1, ... }`.
- **Alternatives Considered**: PostgreSQL, MySQL.
- **Trade-off**: Relational databases provide strict relational foreign keys and SQL joins across tenants out of the box, but MongoDB allows document-level atomic mutations (`findOneAndUpdate`), schema flexibility as task metadata evolves, and native JSON structure matching our Node.js runtime. Relational integrity is enforced in software through Mongoose and middleware.

---

## 2. Why Redis?
- **Problem**: Multi-tenant systems require low-latency read caching, distributed atomic locks, and a high-throughput queue broker.
- **Chosen Approach**: In-memory Redis 7+ instance utilized for tenant-scoped caching (`org:{orgId}:*`) and as the distributed backing engine for BullMQ.
- **Alternatives Considered**: Memcached, MongoDB TTL indexes, RabbitMQ.
- **Trade-off**: Redis data resides in memory, necessitating persistence policies (AOF/RDB) and proper memory budgeting. However, it provides sub-millisecond read/write latency and native sorted set primitives required for delayed job queues.

---

## 3. Why BullMQ?
- **Problem**: Need a robust, distributed job queue in Node.js supporting delayed scheduling, retries with exponential backoff, atomic job locking, and queue metrics.
- **Chosen Approach**: BullMQ backed by Redis sorted sets and Lua scripts.
- **Alternatives Considered**: Agenda (MongoDB-backed), Bee-Queue, Celery.
- **Trade-off**: Requires running and maintaining a Redis instance, but provides battle-tested distributed locking via Redis Lua scripts, zero polling overhead, and high throughput (465+ jobs/sec measured in Phase 4).

---

## 4. Why Delayed Jobs for SLAs?
- **Problem**: Tasks have distinct acknowledgement and completion deadlines that become overdue at arbitrary future timestamps.
- **Chosen Approach**: When a task is created or deadlines are reset, a BullMQ delayed job is scheduled with delay $\Delta t = \text{deadline} - \text{now}$.
- **Alternatives Considered**: Recurring cron polling (`* * * * *`), database polling loops.
- **Trade-off**: Requires job rescheduling when deadlines change. In exchange, the system achieves $O(\log N)$ timer scheduling in Redis sorted sets and wakes up only when an actual deadline expires, eliminating constant database read load.

---

## 5. Why Not `setInterval` Polling?
- **Problem**: Early prototypes often run `setInterval(() => checkOverdue(), 5000)`.
- **Chosen Approach**: Completely removed in-process `setInterval` in Phase 2 in favor of distributed BullMQ delayed jobs.
- **Alternatives Considered**: Distributed lock on `setInterval` via Redlock.
- **Trade-off**: Polling burns CPU and database I/O scanning for overdue tasks even when none exist, suffers from scaling race conditions when multiple API replicas run the interval, and introduces latency equal to the polling interval. BullMQ triggers precisely at deadline expiration and scales horizontally across multiple worker nodes.

---

## 6. Why Not Kafka?
- **Problem**: Asynchronous distributed event processing for task escalations.
- **Chosen Approach**: BullMQ with Redis.
- **Alternatives Considered**: Apache Kafka, AWS SQS, RabbitMQ.
- **Trade-off**: Kafka excels at high-throughput event streaming, log retention, and replayability across hundreds of thousands of events per second. However, Kafka lacks native arbitrary-delay scheduling (running jobs at specific future timestamps requires complex custom delay-bucket topics), requires ZooKeeper/KRaft cluster infrastructure, and introduces unnecessary operational overhead for Sentinel's workload.

---

## 7. Why a Centralized State Machine?
- **Problem**: Direct state updates (`task.state = 'CLOSED'`) scattered across controllers lead to illegal transitions, unrecorded audit gaps, bypassed business rules, and race conditions.
- **Chosen Approach**: Centralized transition engine in [`taskStateMachine.service.js`](file:///d:/Sentinel/sentinel/backend/src/services/taskStateMachine.service.js) (`transitionTask`).
- **Alternatives Considered**: Decentralized controller logic, Mongoose pre-save hooks.
- **Trade-off**: Requires all state changes to route through a single function. In return, it guarantees that valid transition matrices, tenant boundary checks, immutable audit logging, Prometheus metrics, cache invalidation, and WebSocket events are executed reliably on every transition.

---

## 8. Why `slaVersion`?
- **Problem**: When a task is acknowledged or reassigned, a previously scheduled delayed SLA job may still reside in the BullMQ queue.
- **Chosen Approach**: Tasks carry an integer `slaVersion`. When deadlines change, `slaVersion` increments. Delayed jobs carry the `slaVersion` at schedule time. Workers check `task.slaVersion === job.data.slaVersion`.
- **Alternatives Considered**: Explicitly searching and removing BullMQ jobs from the queue on every state transition.
- **Trade-off**: Old jobs still wake up and execute a fast check. However, searching and removing delayed jobs by custom data attributes in Redis is an expensive $O(N)$ operation. The version comparison is an $O(1)$ in-memory check that safely drops stale jobs.

---

## 9. Why Deterministic Job IDs?
- **Problem**: Re-scheduling an SLA job or transient network retries can generate duplicate jobs in the queue for the same task.
- **Chosen Approach**: Job IDs are deterministically formatted as `ack:<taskId>:<slaVersion>` and `action:<taskId>:<slaVersion>`.
- **Alternatives Considered**: Random UUID job IDs.
- **Trade-off**: BullMQ natively deduplicates jobs with identical IDs within the queue. If an attempt is made to schedule the same job version twice, BullMQ rejects the duplicate, guaranteeing at-most-one scheduled job per version.

---

## 10. How Idempotency Works
- **Problem**: Network timeouts, worker crashes, or message broker redeliveries can cause an escalation job to be processed more than once.
- **Chosen Approach**: Workers verify eligibility before action and execute an atomic `findOneAndUpdate` that only matches the expected prior state.
- **Alternatives Considered**: Distributed locks with no-op state checks.
- **Trade-off**: Re-running an escalation job executes a database lookup. However, if the task was already escalated or completed, the update matches 0 documents and returns `null`. The worker logs an idempotent no-op and exits cleanly without creating duplicate audit transitions or events.

---

## 11. How Concurrent Workers are Handled
- **Problem**: Multiple distributed worker processes may pop jobs for the same task at the same instant.
- **Chosen Approach**: Atomic MongoDB version match:
  ```javascript
  Task.findOneAndUpdate(
    { _id: task._id, orgId: task.orgId, state: { $in: eligibleStates }, slaVersion: task.slaVersion },
    { $set: { state: TASK_STATES.ESCALATED, owner: admin._id } }
  )
  ```
- **Alternatives Considered**: Distributed mutexes via Redlock.
- **Trade-off**: MongoDB document-level write locks handle concurrency natively at the database engine level. The winning worker completes the transition; the losing worker receives `null` and safely skips execution. Measured zero duplicate transitions across 8,400 concurrent benchmark tasks in Phase 4.

---

## 12. Why Tenant-Scoped Cache Keys?
- **Problem**: Shared cache keys (e.g., `dashboard:summary`) allow Tenant A to read Tenant B's metrics, causing a catastrophic cross-tenant data leak.
- **Chosen Approach**: Mandatory prefixing: `org:{orgId}:{resource}` enforced by `cacheService.buildTenantKey`.
- **Alternatives Considered**: Separate Redis database per tenant (`SELECT <db>`).
- **Trade-off**: Requires passing `orgId` to all cache calls. However, Redis clusters do not support multiple databases, whereas namespaced keys scale seamlessly across Redis clusters while providing absolute cross-tenant isolation verified by automated regression tests.

---

## 13. Why Compound Indexes?
- **Problem**: Filtering by `orgId` followed by sorting on `updatedAt` without an index causes MongoDB to perform an in-memory sort (blocking up to 32MB) and full collection scan.
- **Chosen Approach**: Compound indexes aligning with query equality-sort-range patterns, such as `{ orgId: 1, updatedAt: -1 }` and `{ orgId: 1, state: 1, updatedAt: -1 }`.
- **Alternatives Considered**: Single-field indexes on `orgId` and `updatedAt`.
- **Trade-off**: Compound indexes consume additional storage and RAM and slightly increase write latency during task creation. In return, query execution time on 50,000 tasks dropped from 491ms to 1ms (a 99.8% reduction), eliminating all in-memory sorting.

---

## 14. Why Separate API and Worker Containers?
- **Problem**: Running the API HTTP server and BullMQ background workers in the same Node.js process causes SLA jobs to steal CPU cycles from HTTP request handling, while API traffic spikes degrade escalation timeliness.
- **Chosen Approach**: Separate Docker containers (`sentinel-api` vs `sentinel-worker`) built from the same codebase but executed with different entrypoint commands.
- **Alternatives Considered**: Single monolithic container running API and worker concurrently via PM2 or shell backgrounding.
- **Trade-off**: Requires orchestrating two container services. In return, the API scales based on HTTP traffic (requests/sec, CPU), while workers scale based on queue depth. Crashes or memory leaks in a worker do not impact API availability.

---

## 15. Why `/health` vs `/ready`?
- **Problem**: Orchestrators (Kubernetes, AWS ECS) need to distinguish between a dead process needing a restart and a process waiting on temporary upstream dependency recovery.
- **Chosen Approach**:
  - `/health` (Liveness): Validates that the Node.js event loop is running and accepting sockets. Never checks the database.
  - `/ready` (Readiness): Validates that MongoDB and Redis connections are active and ready to process traffic. Returns 503 if disconnected.
- **Alternatives Considered**: Single `/health` endpoint checking both process and database.
- **Trade-off**: If a single endpoint checks the database and MongoDB has a temporary network hiccup, the orchestrator kills and restarts healthy Node.js processes, causing a cascading restart storm. Decoupling probes allows the load balancer to pause traffic without restarting containers.

---

## 16. Why Graceful Shutdown?
- **Problem**: Terminating containers during deployments drops in-flight HTTP requests and interrupts active BullMQ jobs, leaving locks in an orphaned state.
- **Chosen Approach**: `setupApiGracefulShutdown` and `setupWorkerGracefulShutdown` in [`shutdown.js`](file:///d:/Sentinel/sentinel/backend/src/utils/shutdown.js) intercept `SIGINT`/`SIGTERM`, stop accepting new connections, and provide a 10-second drain window for active requests and jobs before closing database pools.
- **Alternatives Considered**: Immediate `process.exit(0)`.
- **Trade-off**: Containers take up to a few seconds to exit during deployment. In exchange, zero requests are aborted, zero database transactions are cut mid-write, and zero BullMQ jobs are orphaned.

---

## 17. Why Structured JSON Logging?
- **Problem**: Unstructured `console.log` statements are impossible to parse, filter, and correlate across distributed multi-tenant environments.
- **Chosen Approach**: Centralized Winston logger emitting single-line JSON logs with `requestId`, `orgId`, `userId`, `timestamp`, and `service`.
- **Alternatives Considered**: Plain-text human-readable logging.
- **Trade-off**: Local terminal logs are slightly more verbose, but production log aggregators (Datadog, Loki, CloudWatch) can immediately index, filter, and alert by tenant, request ID, or error code without regex parsing.

---

## 18. Why Prometheus Metrics?
- **Problem**: Operational teams need real-time visibility into request rates, latency percentiles, queue backlog, and cache efficiency without polluting application logs.
- **Chosen Approach**: `prom-client` exposing `/metrics` with low-cardinality metrics (counters, histograms, gauges).
- **Alternatives Considered**: Custom database metric counters, third-party APM agents (New Relic).
- **Trade-off**: Requires Prometheus scraper infrastructure in production. However, Prometheus pull-based metrics consume negligible in-process memory, avoid high-cardinality labels (`orgId` or `userId` are strictly omitted from metric tags to avoid memory leaks), and integrate with standard Grafana dashboards.
