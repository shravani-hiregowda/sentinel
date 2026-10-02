# Sentinel — Technical Interview Guide & Architecture Defense

This guide provides technically precise explanations, deep-dive walkthroughs, and answers to 23 critical engineering questions based strictly on the Sentinel implementation.

---

## Section A: 30-Second Elevator Pitch

> "Sentinel is a production-style, multi-tenant task governance platform built in Node.js and MongoDB that enforces deterministic task state transitions and automated SLA escalations. Instead of relying on unreliable polling loops, it uses Redis and BullMQ delayed jobs to trigger escalations at the exact second a deadline expires. It features optimistic version concurrency control, tenant-isolated caching, comprehensive observability, and a suite of 110 automated tests proving zero duplicate escalations under distributed worker scaling."

---

## Section B: 2-Minute Architecture Pitch

> "Sentinel was designed to solve common production failure modes in SaaS workflow systems: cross-tenant data leakage, illegal state transitions, and race conditions during automated escalations.
>
> On the ingestion side, requests authenticate via JWT, where tenant identity is established server-side from trusted token claims—never from client query or body parameters.
> 
> All state mutations flow through a centralized state machine that validates transitions, prevents mutations to terminal states like CLOSED, and creates an immutable audit trail.
> 
> For SLAs, instead of having the database poll `setInterval` queries every few seconds, we schedule BullMQ delayed jobs in Redis. When a deadline passes, distributed workers compete to escalate the task using an atomic `findOneAndUpdate` lock that matches both state and an integer `slaVersion`. If a task was completed early or reassigned, stale jobs are discarded as idempotent no-ops.
>
> In Phase 4, we audited MongoDB with `explain()`, built compound indexes that reduced query latency by up to 99.8%, eliminated an N+1 query loop on member analytics using a single batch `$group` aggregation, added tenant-scoped Redis caching, and benchmarked the system up to 100 virtual users and distributed multi-worker scaling."

---

## Section C: 5-Minute Deep-Dive Architecture Walkthrough

1. **Client & Ingress Layer**:
   - Clients interact with a React 19 SPA served via Nginx with GZIP compression.
   - API traffic reaches an Express 5 REST & WebSocket cluster protected by Helmet security headers, windowed IP rate limiting (200 req/15m API, 20 req/15m auth), and strict CORS origin validation.
2. **Security & Tenant Context**:
   - Authentication middleware (`protect`) verifies JWT signature, expiration, and session revocation (`tokenVersion`).
   - Tenant middleware (`attachTenantContext`) derives `req.orgId` from the verified user. Any attempt to pass an unmatching `orgId` in the body or query is blocked with an HTTP 403 Forbidden error.
3. **Centralized State Machine**:
   - Validates legal transitions (`OPEN` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `CLOSED`).
   - Ensures `CLOSED` is strictly terminal.
   - Enforces optimistic concurrency locks and creates immutable `TaskStateTransition` audit records.
4. **Distributed SLA Worker Engine**:
   - Decoupled from the API process into standalone worker containers.
   - When a task is created with an `ackDeadline` or `actionDeadline`, BullMQ enqueues a delayed job in Redis with a deterministic ID (`ack:<taskId>:<slaVersion>`).
   - Workers pick up jobs only when runnable, verify `slaVersion` against the live database, and execute an atomic update.
5. **Caching & Aggregation Performance**:
   - Tenant-scoped caching (`org:{orgId}:{resource}`) ensures zero cross-tenant cache leakage.
   - Event-driven cache invalidation clears dashboard keys upon task creation, state transitions, or SLA escalations.
   - N+1 query reduction: Member performance dashboard replaced 361 individual queries with 2 batch operations (a user lookup + an aggregation pipeline with an in-memory Map).
6. **Observability & Operational Verification**:
   - Single-line structured JSON logs with correlation IDs (`requestId`, `orgId`, `userId`).
   - Prometheus `/metrics` scraping with low-cardinality labels.
   - Decoupled `/health` (process liveness) and `/ready` (dependency readiness) endpoints.
   - Verified by 110 automated tests, clean ESLint, and a complete CI/CD pipeline in GitHub Actions.

---

## Section D: Technical Deep-Dive Topics

- **Multi-Tenancy**: Logical pooled tenancy using strict server-derived `req.orgId` on every document, query, Redis key, and Socket room.
- **RBAC**: Role hierarchy separating `ADMIN` (task creation, reassignments, member onboarding) from `MEMBER` (acknowledgement, progress, completion).
- **State Machine**: Enforces a directed acyclic graph (DAG) of task states with immutable transition audit logging.
- **SLA Versioning**: Integer counter on tasks preventing race conditions and stale job executions.
- **Worker Concurrency**: Tested across concurrency 1, 5, 10, and 20; concurrency 10 identified as the throughput sweet spot (465 jobs/sec).
- **Graceful Shutdown**: Intercepts `SIGINT`/`SIGTERM` to drain active HTTP requests and BullMQ jobs within a 10-second timeout window before closing database connections.

---

## Section E: 23 Critical Engineering Interview Questions & Answers

### 1. Why Redis?
> **Answer**: Redis provides sub-millisecond in-memory caching and acts as the distributed backing engine for BullMQ. Its native sorted sets enable $O(\log N)$ insertion and retrieval of delayed jobs based on future unix timestamps, eliminating polling.

### 2. Why BullMQ instead of `setInterval`?
> **Answer**: `setInterval` polls the database constantly, wasting CPU and I/O even when no deadlines are expiring. When scaling to multiple API nodes, `setInterval` leads to duplicate processing unless complex distributed locking is implemented. BullMQ uses Redis sorted sets to wake workers up only when a delayed job is due, distributing jobs across any number of worker processes.

### 3. Why BullMQ instead of Kafka?
> **Answer**: Kafka is designed for high-throughput append-only event streaming and log replayability across millions of events. It lacks native arbitrary-delay scheduling (running a job 4 hours into the future requires complex delay-bucket topics) and introduces massive operational complexity (ZooKeeper/KRaft). BullMQ natively supports delayed execution, retry backoff, and dead-letter queues with a simple Redis dependency.

### 4. What happens if the worker crashes mid-execution?
> **Answer**: BullMQ uses distributed lock renewal. If a worker process abruptly dies, its lock expires after 30 seconds. BullMQ identifies the stalled job and re-queues it for another active worker. When the job is re-run, our atomic transition lock ensures it is either processed safely or skipped if the state was already changed.

### 5. What happens if the same job runs twice?
> **Answer**: The job is strictly idempotent. The worker executes `Task.findOneAndUpdate` with conditions `{ state: { $in: eligibleStates }, slaVersion: task.slaVersion }`. The second execution will find that the task state is already `ESCALATED` or `CLOSED`, returning `null`. The worker logs an `ALREADY_TRANSITIONED` no-op and exits cleanly without creating duplicate audit transitions or events.

### 6. How do you prevent duplicate escalations under high concurrency?
> **Answer**: At the queue layer, deterministic job IDs (`ack:<taskId>:<slaVersion>`) prevent duplicate scheduling. At the database layer, an atomic `findOneAndUpdate` lock ensures that even if two workers pull the job simultaneously, only one write succeeds at the database engine level.

### 7. How do you prevent cross-tenant data access?
> **Answer**: Tenant context is derived strictly from the verified JWT (`req.user.orgId`) in `attachTenantContext`. It is never read from client parameters. Furthermore, every database query includes `{ orgId: req.orgId }`, cache keys are prefixed with `org:{orgId}:`, and Socket.IO messages are emitted to tenant-specific rooms.

### 8. How does tenant context get established?
> **Answer**: The client sends a JWT Bearer token in the `Authorization` header. `protect` verifies the token cryptographically and loads the user. `attachTenantContext` extracts `req.user.orgId`, compares it against any user-supplied candidate IDs in body or query (throwing 403 on mismatch), and binds `req.orgId` for all downstream controllers.

### 9. How does the centralized state machine work?
> **Answer**: `transitionTask` receives the task, the target state, the actor, and the verified `orgId`. It validates the transition against `VALID_TRANSITIONS[fromState]`, applies the state change, runs optional pre-save hooks, saves the task, creates an immutable `TaskStateTransition` record, increments Prometheus metrics, invalidates the tenant dashboard cache, and emits a real-time event.

### 10. Why is `CLOSED` a terminal state?
> **Answer**: In governance workflows, once a task is completed, audited, and closed, reopening it corrupts SLA metrics and historical compliance records. If work must resume, a new task must be created with a reference to the previous task.

### 11. What is `slaVersion`?
> **Answer**: `slaVersion` is an integer on the Task document that tracks SLA deadline updates. When an admin reassigns a task and resets deadlines, `slaVersion` increments (e.g. 1 $\rightarrow$ 2). When the old delayed job for version 1 triggers, the worker detects that `task.slaVersion (2) !== job.slaVersion (1)` and drops the job immediately.

### 12. How do stale jobs get rejected?
> **Answer**: Stale jobs are rejected through two checks:
> 1. Version check: `task.slaVersion !== job.data.slaVersion`.
> 2. State eligibility check: `eligibleStates.includes(task.state)` (e.g., if a task is already `ACKNOWLEDGED`, an overdue ACK job is rejected).

### 13. How did you eliminate the N+1 query?
> **Answer**: In the member performance dashboard, the system previously fetched $N$ members and ran 3 separate queries per member inside a loop ($3N + 1$ queries; 361 queries for 120 members, taking 768ms). We replaced this with a single batch `Task.aggregate([ { $match: { orgId } }, { $group: { _id: "$owner", totalAssigned: { $sum: 1 }, completed: { $sum: ... } } } ])` and mapped the results in memory in $O(M)$ time using a JavaScript `Map`. Total queries dropped to 2, and latency dropped to 99ms (an 87.1% improvement).

### 14. How did indexes improve query performance?
> **Answer**: In Phase 4, we used `explain('executionStats')` on a 50,000-task dataset. Admin task listing sorted by `updatedAt` was performing a full `COLLSCAN` and in-memory sort taking 491ms. Adding the compound index `{ orgId: 1, updatedAt: -1 }` allowed MongoDB to use an `IXSCAN` and examine only the 10 documents returned, dropping latency to 1ms.

### 15. Why Redis caching?
> **Answer**: High-frequency dashboard reads (KPI counts, member performance) read aggregated data that changes only when tasks are mutated. Caching the computed summaries in Redis drops response latency from 30–60ms down to 1–2ms and removes read load from MongoDB during traffic bursts.

### 16. How do you invalidate the cache?
> **Answer**: We use an explicit, event-driven invalidation strategy. Whenever a task is created, transitioned, or escalated, `invalidateDashboardCache(orgId)` executes a non-blocking Redis `SCAN` matching `org:{orgId}:dashboard:*` and deletes matching keys. Keys also carry a 60-second safety TTL.

### 17. How did you load test the system?
> **Answer**: We seeded a realistic 50,000-task performance database across 12 organizations. Using Grafana k6, we benchmarked the Dashboard API, Task Operations, and Task Concurrency under 10, 25, 50, and 100 virtual users, capturing RPS, p50, p95, and Prometheus metrics.

### 18. What happens when MongoDB goes down?
> **Answer**: The `/health` endpoint remains 200 (Node.js event loop alive), but `/ready` immediately returns 503 Service Unavailable (`checks.mongodb.status: "down"`). Load balancers detect the 503 and pull the node out of rotation before client requests fail. When MongoDB reconnects, `/ready` automatically recovers to 200.

### 19. What happens when Redis goes down?
> **Answer**: The `/ready` endpoint returns 503. The caching layer gracefully catches the Redis error, logs a warning, and falls back directly to MongoDB so existing read requests can still be served if traffic reaches the node.

### 20. How would you scale the system horizontally?
> **Answer**: Because the API is stateless, it can scale to $N$ replicas behind an Application Load Balancer. Workers scale independently against BullMQ queue depth. Because MongoDB write lock contention begins to appear above concurrency 10 on a single primary node, scaling beyond 1,000 jobs/sec would involve MongoDB sharding by `orgId` (tenant-based sharding).

### 21. How would you monitor it in production?
> **Answer**:
> 1. Logs: Structured JSON shipped via FluentBit to Datadog or CloudWatch.
> 2. Metrics: Prometheus server scraping `/metrics` every 15s, alerting on error rate > 1%, API p95 > 500ms, and BullMQ worker job failures > 0.
> 3. Tracing: Request IDs passed in headers (`x-request-id`) to correlate distributed events.

### 22. What are the current limitations?
> **Answer**:
> 1. Single Primary MongoDB: High concurrency write operations are bounded by primary write lock capacity.
> 2. In-Process Socket.IO: WebSocket broadcasts currently operate in a single process; multi-instance API deployments require the `@socket.io/redis-adapter`.
> 3. Transient Dependency on Redis: SLA scheduling stops if Redis is completely unavailable.

### 23. What would you improve next?
> **Answer**:
> 1. Implement `@socket.io/redis-adapter` for multi-instance WebSocket synchronization.
> 2. Introduce OpenTelemetry distributed tracing spans across HTTP and BullMQ job processing boundaries.
> 3. Implement tenant-level tiered rate limiting (e.g. Enterprise vs Basic tiers).
