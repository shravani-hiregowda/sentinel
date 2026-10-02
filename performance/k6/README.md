# Sentinel Phase 4 — k6 Performance Benchmark Suite

This directory contains automated k6 performance and load testing scripts for the Sentinel multi-tenant task-governance SaaS.

## Prerequisites

1. **k6**: Installed (`k6 version`).
2. **MongoDB**: Running with benchmark dataset (`npm run seed:benchmark`).
3. **Redis**: Running on `127.0.0.1:6379`.
4. **Sentinel API**: Running (e.g. `PORT=5001 npm start`).

## Scripts

| Script | Purpose | Representative Scenarios |
|---|---|---|
| `dashboard.js` | Admin Dashboard Latency & Throughput | Summary counts, Member Performance report |
| `task-api.js` | Core CRUD & Listing Operations | Admin task listing, state filtering, member tasks, task creation |
| `task-concurrency.js` | High-Concurrency Task Creation | Simulates concurrent writes and validates 0 duplicate records |
| `sla-escalation.js` | SLA Monitoring Under Load | Escalated and overdue task retrieval under high traffic |

## Running Benchmarks Manually

Export required environment variables:

```bash
export BASE_URL="http://127.0.0.1:5001"
export ADMIN_TOKEN="<jwt_admin_token>"
export MEMBER_TOKEN="<jwt_member_token>"
export MEMBER_ID="<member_user_id>"
export VUS=50
```

Execute k6:

```bash
# Dashboard load test with 25 VUs
k6 run -e VUS=25 dashboard.js

# Task API load test with 50 VUs
k6 run -e VUS=50 task-api.js

# Task creation concurrency stress test with 100 VUs
k6 run -e VUS=100 task-concurrency.js
```

## Automated Runner

To run the entire suite across 10, 25, 50, and 100 virtual users and capture results automatically:

```bash
node performance/run-k6-suite.js
```
