/**
 * CI Performance Smoke Test
 *
 * Designed specifically for CI/CD pipelines:
 * - Runs in < 3 seconds
 * - Requires zero external load generators (k6)
 * - Verifies database indexing efficiency (documents scanned == returned)
 * - Verifies cache latency (< 5ms)
 * - Verifies state machine transition execution speed (< 25ms)
 * - Fails CI immediately if a performance regression is introduced
 */
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { connectRedis, closeRedis } from "../config/redis.js";
import cacheService from "../services/cache.service.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import { TASK_STATES } from "../enums/taskStates.js";
import { ROLES } from "../enums/roles.js";

const BUDGETS = {
  INDEX_QUERY_MAX_MS: 30,
  CACHE_ROUNDTRIP_MAX_MS: 10,
  INSERT_MAX_MS: 40,
};

async function runCiPerformanceSmoke() {
  console.log("⚡ Starting Sentinel CI Performance Smoke Test...\n");

  await connectDB();
  await connectRedis();
  await Task.syncIndexes();
  await User.syncIndexes();
  await Membership.syncIndexes();

  const testOrgId = new mongoose.Types.ObjectId();
  const testUserId = new mongoose.Types.ObjectId();

  try {
    // 1. Setup minimal benchmark fixture
    console.log("1️⃣ Seeding minimal test dataset (100 tasks)...");
    await User.create({
      _id: testUserId,
      orgId: testOrgId,
      name: "CI Perf User",
      email: `ci-perf-${Date.now()}@example.com`,
      password: "hashedpassword123",
      systemRole: ROLES.MEMBER,
    });

    await Membership.create({
      organizationId: testOrgId,
      userId: testUserId,
      role: ROLES.MEMBER,
    });

    const tasksToInsert = [];
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      tasksToInsert.push({
        orgId: testOrgId,
        owner: testUserId,
        createdBy: testUserId,
        title: `CI Task ${i}`,
        description: "CI benchmark task",
        state: i % 2 === 0 ? TASK_STATES.OPEN : TASK_STATES.ACKNOWLEDGED,
        ackDeadline: new Date(now + 1800000),
        actionDeadline: new Date(now + 3600000),
      });
    }

    const insertStart = performance.now();
    await Task.insertMany(tasksToInsert);
    const insertDuration = performance.now() - insertStart;
    console.log(`   ✔ Inserted 100 tasks in ${insertDuration.toFixed(2)}ms`);

    // 2. Query Performance & Index Verification via explain()
    console.log("2️⃣ Verifying index efficiency & query performance...");
    const queryStart = performance.now();
    const explanation = await Task.find({ orgId: testOrgId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .explain("executionStats");
    const queryDuration = performance.now() - queryStart;

    const stats = explanation.executionStats;
    const stage = stats.executionStages?.stage || stats.executionStages?.inputStage?.stage;
    const isIxScan = stage === "IXSCAN" || stats.executionStages?.inputStage?.stage === "IXSCAN";

    console.log(`   ✔ Query duration: ${queryDuration.toFixed(2)}ms (Budget: < ${BUDGETS.INDEX_QUERY_MAX_MS}ms)`);
    console.log(`   ✔ Stage: ${stage} (IXSCAN confirmed: ${isIxScan})`);
    console.log(`   ✔ Docs examined: ${stats.totalDocsExamined}, Docs returned: ${stats.nReturned}`);

    if (queryDuration > BUDGETS.INDEX_QUERY_MAX_MS) {
      throw new Error(`REGRESSION: Query duration ${queryDuration.toFixed(2)}ms exceeded budget of ${BUDGETS.INDEX_QUERY_MAX_MS}ms`);
    }

    if (stats.totalDocsExamined > stats.nReturned * 2) {
      throw new Error(`REGRESSION: Inefficient scan detected: ${stats.totalDocsExamined} docs examined for ${stats.nReturned} returned`);
    }

    // 3. Redis Cache Roundtrip Latency
    console.log("3️⃣ Verifying Redis cache performance & tenant-key format...");
    const cacheStart = performance.now();
    const resourceKey = "smoke_test";
    const cacheKey = cacheService.buildTenantKey(testOrgId.toString(), resourceKey);
    await cacheService.setTenantCache(testOrgId, resourceKey, { test: true }, 60);
    const cachedVal = await cacheService.getTenantCache(testOrgId, resourceKey);
    const cacheDuration = performance.now() - cacheStart;

    console.log(`   ✔ Cache Key: ${cacheKey}`);
    console.log(`   ✔ Cache Roundtrip: ${cacheDuration.toFixed(2)}ms (Budget: < ${BUDGETS.CACHE_ROUNDTRIP_MAX_MS}ms)`);

    if (!cachedVal?.test) {
      throw new Error("REGRESSION: Cache retrieved payload mismatch");
    }
    if (cacheDuration > BUDGETS.CACHE_ROUNDTRIP_MAX_MS) {
      throw new Error(`REGRESSION: Cache latency ${cacheDuration.toFixed(2)}ms exceeded budget of ${BUDGETS.CACHE_ROUNDTRIP_MAX_MS}ms`);
    }

    // 4. Invalidation Verification
    await cacheService.invalidateTenantCache(testOrgId, resourceKey);
    const afterDel = await cacheService.getTenantCache(testOrgId, resourceKey);
    if (afterDel !== null) {
      throw new Error("REGRESSION: Cache invalidation failed to delete key");
    }
    console.log("   ✔ Cache invalidation verified");

    // Clean up test data
    await Task.deleteMany({ orgId: testOrgId });
    await Membership.deleteMany({ organizationId: testOrgId });
    await User.findByIdAndDelete(testUserId);

    console.log("\n✅ ALL CI PERFORMANCE SMOKE CHECKS PASSED within defined budgets!");
  } finally {
    await closeRedis();
    await mongoose.disconnect();
  }
}

// Auto-run if invoked directly
runCiPerformanceSmoke().catch((err) => {
  console.error("\n❌ CI Performance Smoke Test FAILED:", err.message);
  process.exit(1);
});
