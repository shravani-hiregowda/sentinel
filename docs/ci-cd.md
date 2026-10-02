# Sentinel — CI/CD Pipeline & Automated Verification Strategy

## 1. Overview

Sentinel's continuous integration and deployment pipeline ensures that every code change is deterministically validated for code quality, architectural security, multi-tenant isolation, regression-free performance, and container buildability before reaching production.

```text
                                DEVELOPER COMMIT / PR
                                          │
                                          ▼
                            GITHUB ACTIONS CI PIPELINE
                                          │
                   ┌──────────────────────┼──────────────────────┐
                   ▼                      ▼                      ▼
           Container Services      Code Quality           Deterministic Build
           - MongoDB 7.0           - ESLint Backend       - npm ci (Backend)
           - Redis 7 Alpine        - ESLint Frontend      - npm ci (Frontend)
                                   - Security Audit
                                          │
                                          ▼
                              AUTOMATED TEST MATRIX
                       - Unit & Integration Tests (110 Tests)
                       - Cross-Tenant Security Isolation
                       - Atomic Concurrency & State Machine
                       - BullMQ Worker Idempotency
                       - Deployment Smoke Test Suite
                       - Resilience & Outage Recovery Tests
                                          │
                                          ▼
                             CI PERFORMANCE SMOKE TEST
                       - Index query duration < 30ms
                       - Documents examined == Documents returned
                       - Redis cache roundtrip < 10ms
                       - Cache invalidation verification
                                          │
                                          ▼
                             CONTAINER ARTIFACT BUILDS
                       - Docker Multi-stage API Build
                       - Docker Multi-stage Frontend Build
                       - Tagged: sentinel-api:<git-sha>
```

---

## 2. Pipeline Stages

### Stage 1: Deterministic Dependency Installation
- Uses `npm ci` across both `backend` and `frontend` sub-projects.
- Relies strictly on checked-in `package-lock.json` lockfiles to guarantee zero dependency drift across environments.
- Caches `~/.npm` directory keyed by lockfile hash.

### Stage 2: Automated Security Audit
- Command: `npm --prefix backend audit --audit-level=critical`
- Policy: Fails the pipeline if any **Critical** severity CVE is detected in direct or transitive production dependencies.
- **Accepted Exceptions Policy**: High-severity advisories in transitive development tooling (e.g. `ajv` inside ESLint, `brace-expansion` inside legacy glob packages) are audited and monitored. Packages are upgraded during scheduled maintenance windows rather than uncoordinated breaking updates.

### Stage 3: Code Quality & Linting
- Backend: `npm --prefix backend run lint` (ESLint 9 Flat Config)
- Frontend: `npm --prefix frontend run lint` (React Hooks & Refresh checks)
- Quality Gate: **Zero ESLint errors, zero ESLint warnings**.

### Stage 4: Test Suite Execution (110 Tests)
The full test suite executes against isolated, ephemeral MongoDB and Redis container services:
1. `authorization.test.js`: RBAC role hierarchies and permissions.
2. `tenantIsolation.test.js`: Cross-tenant boundary enforcement and tampering prevention.
3. `stateMachine.test.js`: Valid and invalid state transitions, optimistic locking.
4. `queueAndWorker.test.js`: BullMQ delayed scheduling, concurrency, retry backoff.
5. `validation.test.js`: Request payload validation, ObjectId sanitization.
6. `healthAndReadiness.test.js`: Process liveness and dependency status.
7. `metrics.test.js`: Prometheus metric emission and low-cardinality label verification.
8. `performance.test.js`: Compound index usage via `explain()` and cache isolation.
9. `deploymentSmoke.test.js`: End-to-end user auth, task CRUD, and Socket.IO handshakes.
10. `resilienceFailure.test.js`: Recovery under simulated Redis and MongoDB downtime.

### Stage 5: CI Performance Smoke Test vs Full Performance Benchmark

Sentinel maintains a clear distinction between the lightweight test run on every PR and the full benchmark suite:

| Characteristic | CI Performance Smoke Test (`test:ci-perf`) | Full Phase 4 Benchmark Suite (`benchmark:k6`) |
|---|---|---|
| **Trigger** | Every Commit & Pull Request | Pre-release, Staging, Major Milestones |
| **Duration** | < 3 seconds | 5–10 minutes |
| **Target Dataset** | 100 in-memory fixture tasks | 50,000 tasks, 100,000 transitions (`sentinel_perf`) |
| **Load Tool** | Native Node.js `performance.now()` | Grafana k6 (10, 25, 50, 100 Virtual Users) |
| **Thresholds** | Index query < 30ms; Cache latency < 10ms | API p95 < 200ms; Worker throughput > 400 jobs/s |
| **Dependencies** | Requires only Node.js, Mongo, Redis | Requires k6 CLI, dedicated perf database |

### Stage 6: Frontend Production Build
- Command: `npm --prefix frontend run build`
- Produces optimized static bundle in `frontend/dist/` (156 modules transformed in ~1.2s).
- Validates bundle size and chunk generation.

### Stage 7: Production Service Startup Verification
- Launches `backend/src/server.js` in background, polls `http://localhost:5000/health` and `/ready` with `curl`, verifies HTTP 200 readiness response, and sends `SIGTERM` for clean shutdown.
- Launches `backend/src/workers/escalation.worker.js` in background, verifies connection to MongoDB and Redis, and sends `SIGTERM`.

### Stage 8: Docker Image Packaging & Tagging
- Builds multi-stage production Docker images for `sentinel-api` and `sentinel-frontend`.
- Tags images with the immutable Git commit SHA: `sentinel-api:${{ github.sha }}`.
- Avoids relying on mutable `latest` tags.
