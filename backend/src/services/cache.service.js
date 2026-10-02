import { getRedisConnection } from "../config/redis.js";
import logger from "../utils/logger.js";
import { recordCacheHit, recordCacheMiss } from "../metrics/metrics.js";

/**
 * Tenant-Safe Redis Caching Service
 *
 * Guarantees:
 * 1. Strict Tenant Isolation: Every key is prefixed with `org:{orgId}:`.
 * 2. Cross-Tenant Leakage Prevention: An org can NEVER read or overwrite another org's cached data.
 * 3. Graceful Fallback: If Redis is disconnected or errors, requests transparently fall back to MongoDB.
 * 4. Observability: Records cache hits and misses in Prometheus metrics.
 */

const getClient = () => {
  try {
    return getRedisConnection();
  } catch {
    return null;
  }
};

/**
 * Builds a strict, tenant-scoped cache key.
 * Format: org:{orgId}:{resourceKey}
 *
 * @param {string|Object} orgId - Tenant ObjectId or string
 * @param {string} resourceKey - Resource identifier (e.g. "dashboard:summary")
 * @returns {string} Fully qualified tenant cache key
 */
export const buildTenantKey = (orgId, resourceKey) => {
  if (!orgId) {
    throw new Error("Tenant isolation violation: orgId is mandatory for caching");
  }
  const cleanOrgId = orgId.toString ? orgId.toString() : String(orgId);
  return `org:${cleanOrgId}:${resourceKey}`;
};

/**
 * Gets cached data for a specific tenant.
 *
 * @param {string|Object} orgId - Tenant ObjectId
 * @param {string} resourceKey - e.g. "dashboard:summary"
 * @returns {Promise<any|null>} Parsed JSON data or null on miss/error
 */
export const getTenantCache = async (orgId, resourceKey) => {
  const client = getClient();
  if (!client) {
    recordCacheMiss(resourceKey);
    return null;
  }

  const key = buildTenantKey(orgId, resourceKey);
  try {
    const raw = await client.get(key);
    if (!raw) {
      recordCacheMiss(resourceKey);
      return null;
    }
    recordCacheHit(resourceKey);
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Redis get failed for ${key}: ${err.message}`, {
      event: "cache.get_error",
      key,
    });
    recordCacheMiss(resourceKey);
    return null;
  }
};

/**
 * Sets cached data for a specific tenant with TTL.
 *
 * @param {string|Object} orgId - Tenant ObjectId
 * @param {string} resourceKey - e.g. "dashboard:summary"
 * @param {any} data - Data to serialize and store
 * @param {number} [ttlSeconds=60] - TTL in seconds
 * @returns {Promise<boolean>}
 */
export const setTenantCache = async (orgId, resourceKey, data, ttlSeconds = 60) => {
  const client = getClient();
  if (!client) return false;

  const key = buildTenantKey(orgId, resourceKey);
  try {
    const serialized = JSON.stringify(data);
    await client.set(key, serialized, "EX", ttlSeconds);
    return true;
  } catch (err) {
    logger.warn(`Redis set failed for ${key}: ${err.message}`, {
      event: "cache.set_error",
      key,
    });
    return false;
  }
};

/**
 * Invalidates specific tenant resource or keys matching pattern for that tenant.
 * Example: `org:{orgId}:dashboard:*`
 *
 * @param {string|Object} orgId - Tenant ObjectId
 * @param {string} [pattern="*"] - Suffix pattern
 * @returns {Promise<number>} Number of keys invalidated
 */
export const invalidateTenantCache = async (orgId, pattern = "*") => {
  const client = getClient();
  if (!client) return 0;

  const tenantPrefix = `org:${orgId.toString ? orgId.toString() : String(orgId)}:`;
  const fullPattern = `${tenantPrefix}${pattern}`;

  try {
    // If exact key without wildcards
    if (!pattern.includes("*")) {
      const deleted = await client.del(fullPattern);
      return deleted;
    }

    // Use SCAN to safely find matching keys without blocking Redis
    const stream = client.scanStream({
      match: fullPattern,
      count: 100,
    });

    let count = 0;
    for await (const keys of stream) {
      if (keys.length > 0) {
        // Enforce extra safety: Ensure all scanned keys belong to this orgId
        const safeKeys = keys.filter((k) => k.startsWith(tenantPrefix));
        if (safeKeys.length > 0) {
          const removed = await client.del(...safeKeys);
          count += removed;
        }
      }
    }
    return count;
  } catch (err) {
    logger.warn(`Redis invalidation failed for ${fullPattern}: ${err.message}`, {
      event: "cache.invalidate_error",
      pattern: fullPattern,
    });
    return 0;
  }
};

/**
 * Specifically invalidates dashboard caches for a tenant when tasks mutate.
 *
 * @param {string|Object} orgId
 */
export const invalidateDashboardCache = async (orgId) => {
  return invalidateTenantCache(orgId, "dashboard:*");
};

export default {
  buildTenantKey,
  getTenantCache,
  setTenantCache,
  invalidateTenantCache,
  invalidateDashboardCache,
};
