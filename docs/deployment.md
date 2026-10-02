# Sentinel — Production Deployment & Operations Guide

## 1. System Architecture

Sentinel is architected as an independently scalable, multi-tenant task-governance platform. In production, each component is decoupled into isolated containers sharing centralized data stores:

```text
                           INTERNET / CLIENTS
                                   │
                                   ▼
                         TLS / Reverse Proxy
                      (AWS ALB / Cloudflare / Nginx)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          React SPA Frontend              Express API Cluster
       (Nginx Static Container)         (Stateless Node.js API)
                    │                             │
                    │               ┌─────────────┼─────────────┐
                    │               ▼             ▼             ▼
                    │            MongoDB        Redis       Socket.IO
                    │         (Replica Set)   (Cluster/HA)  (WebSockets)
                    │                             │
                    │                          BullMQ
                    │                             │
                    │                             ▼
                    │                   SLA Escalation Workers
                    │                  (Horizontally Scalable)
                    │                             │
                    └─────────────────────────────┘
```

### Key Architectural Principles
1. **Independent Scaling**: The API processes client requests, while SLA workers process BullMQ delay queues. They scale on separate autoscaling policies (CPU/Requests for API vs Queue depth for Workers).
2. **Strict Multi-Tenancy**: Every request, query, cache key, and event payload enforces `orgId` isolation.
3. **Resilience & Graceful Degradation**: Liveness (`/health`) and Readiness (`/ready`) endpoints monitor underlying dependencies, enabling automated load balancer traffic shifting.

---

## 2. Environment Configuration Strategy

Sentinel strictly adheres to Twelve-Factor App configuration principles. Environment variables are categorized by environment:

| Category | Variable | Default / Example | Purpose |
|---|---|---|---|
| **Runtime** | `NODE_ENV` | `production` | Enables production optimizations & disables stack traces |
| **Server** | `PORT` | `5000` | HTTP listening port |
| **Database** | `MONGO_URI` | `mongodb://user:pass@host:27017/sentinel?replicaSet=rs0&authSource=admin&ssl=true` | MongoDB connection string |
| **Pool Size** | `MONGO_MAX_POOL_SIZE` | `50` (API) / `20` (Worker) | Connection pool bounding |
| **Redis** | `REDIS_HOST` | `redis.internal` | Redis hostname |
| **Redis** | `REDIS_PORT` | `6379` | Redis TCP port |
| **Redis** | `REDIS_PASSWORD` | `<STRONG_SECRET>` | Redis AUTH token |
| **Auth** | `JWT_SECRET` | `<64_CHAR_HEX>` | Mandatory high-entropy secret for signing tokens |
| **Auth** | `JWT_EXPIRES_IN` | `7d` | Token validity window |
| **CORS** | `CLIENT_ORIGIN` | `https://app.sentinelgov.io` | Comma-separated allowed browser origins |
| **Rate Limit** | `RATE_LIMIT_WINDOW_MS`| `900000` (15m) | Window duration |
| **Rate Limit** | `RATE_LIMIT_MAX` | `200` | Max requests per IP per window |
| **Rate Limit** | `AUTH_RATE_LIMIT_MAX` | `20` | Max auth attempts per IP per window |
| **Observability**| `LOG_LEVEL` | `info` | JSON log verbosity (`debug`, `info`, `warn`, `error`) |
| **Operations** | `SHUTDOWN_TIMEOUT_MS` | `10000` | Maximum graceful shutdown drain time |

Reference configuration templates:
- [`.env.example`](file:///d:/Sentinel/sentinel/.env.example) (Development)
- [`.env.test.example`](file:///d:/Sentinel/sentinel/.env.test.example) (Testing & CI)
- [`.env.production.example`](file:///d:/Sentinel/sentinel/.env.production.example) (Production)

---

## 3. Local Production-Like Deployment (Docker Compose)

Sentinel provides an exact production-equivalent stack using Docker Compose:

### 3.1 Start Stack
```bash
# 1. Create your production environment file
cp .env.production.example .env

# 2. Build images and start all 5 containers
docker compose up -d --build

# 3. View running containers & health status
docker compose ps
```

### 3.2 Containers Launched
1. `sentinel-mongodb`: Mongo 7.0 with native ping healthcheck.
2. `sentinel-redis`: Redis 7 Alpine with persistent storage & ping healthcheck.
3. `sentinel-api`: Multi-stage, non-root Node.js container running API with `/ready` healthcheck.
4. `sentinel-worker`: Multi-stage, non-root Node.js container executing BullMQ worker.
5. `sentinel-frontend`: Multi-stage static build served by optimized Nginx with `/healthz` check.

### 3.3 Scaling Workers Horizontally in Compose
```bash
docker compose up -d --scale worker=3
```

---

## 4. Container Health Checks & Liveness Probes

### API Container Health
- **Liveness Probe**: `GET http://localhost:5000/health`
  - Returns `200 OK` with `{ status: "ok", service: "sentinel-api", uptime: ... }`
  - Validates that Node.js event loop is unblocked and accepting connections.
- **Readiness Probe**: `GET http://localhost:5000/ready`
  - Returns `200 OK` when MongoDB (`readyState === 1`) and Redis (`PING === PONG`) are healthy.
  - Returns `503 Service Unavailable` if MongoDB or Redis is unreachable. Load balancers must stop routing user traffic until dependencies recover.

### Frontend Container Health
- **Liveness & Readiness**: `GET http://localhost:80/healthz`
  - Returns `200 OK` directly from Nginx without upstream dependencies.

### MongoDB Container Health
- `mongosh --quiet --eval "db.adminCommand('ping')"`

### Redis Container Health
- `redis-cli ping`

---

## 5. Database Initialization & Production Bootstrap

> [!CAUTION]
> Production startup must **NEVER** run destructive seed scripts or development seeds automatically.

Sentinel enforces strict separation between schema initialization and data seeding:

### Step 1: Idempotent Index Synchronization
Run before routing live traffic or during automated deployment:
```bash
# Synchronizes all compound indexes across Task, User, Membership, AuditLog, and EscalationEvent
npm --prefix backend run db:init-indexes
```

### Step 2: Idempotent Production Admin Bootstrap
Run once when provisioning a new environment:
```bash
ADMIN_EMAIL="secops@sentinelgov.io" \
ADMIN_PASSWORD="YourStrongSecurePassword123!" \
ORG_NAME="Acme Corp" \
npm --prefix backend run db:bootstrap
```
- Strictly idempotent: If the user or organization already exists, it verifies and exits cleanly.
- Never creates public or hardcoded passwords.
- Never seeds test or benchmark datasets.

---

## 6. Cloud Deployment Guide (AWS / Kubernetes Target)

### 6.1 AWS ECS (Fargate) Architecture
1. **Network**: VPC with 2 public subnets (ALB) and 2 private subnets (Fargate, DocumentDB, ElastiCache).
2. **Data Tier**:
   - Amazon DocumentDB (MongoDB 5.0/7.0 compatible) or MongoDB Atlas in private VPC peering.
   - Amazon ElastiCache for Redis (Multi-AZ with automatic failover).
3. **Compute Tier**:
   - `sentinel-api` Service: Target Group linked to ALB (`/ready` health check path). Autoscaling on CPU > 70% or Request Count > 500/target.
   - `sentinel-worker` Service: Headless ECS service. Autoscaling on CloudWatch Metric `BullMQ_Delayed_Jobs` or CPU > 75%.
4. **Edge / Frontend Tier**:
   - CloudFront CDN + Amazon S3 bucket (or ECS Nginx container behind ALB).
   - Route53 with ACM SSL/TLS certificate.

### 6.2 Resource Allocation Guidelines (Based on Phase 4 Benchmarks)

| Service | Target Instances | CPU Allocation | Memory Allocation | Notes |
|---|---|---|---|---|
| **API Server** | 2–6 replicas | 1.0 vCPU | 2 GB | Handles 400+ RPS per instance with caching |
| **SLA Worker** | 2–4 replicas | 0.5–1.0 vCPU | 1.5 GB | Concurrency 10 sweet-spot handles 450+ jobs/sec |
| **MongoDB** | Replica Set (1 Primary, 1 Secondary, 1 Arbiter) | 2.0 vCPU | 8 GB | Supports 50,000+ tasks with compound indexes |
| **Redis** | Primary + Replica | 1.0 vCPU | 4 GB | Low memory footprint (< 100MB for 50k keys) |
| **Frontend** | 2 Nginx replicas | 0.25 vCPU | 512 MB | Static assets gzip-compressed and cached |
