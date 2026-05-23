/**
 * Rate Limiter
 *
 * Redis-based sliding window rate limiter for Instagram DM sending.
 * Enforces a cap of 190 DMs per hour per Instagram account.
 */

import Redis from "ioredis";

const RATE_LIMIT_MAX = 190; // DMs per hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const REQUEUE_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_REQUEUE_ATTEMPTS = 3;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return redis;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  remainingDMs: number;
  shouldRequeue: boolean;
  requeueDelayMs: number;
  shouldSkip: boolean;
  reserved: boolean;
}

const RESERVE_DM_SLOT_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current >= max then
  return {0, current, 0}
end

local next_count = redis.call("INCR", KEYS[1])
if next_count == 1 then
  redis.call("EXPIRE", KEYS[1], ttl)
end

return {1, next_count, max - next_count}
`;

function toScriptNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10);
  return 0;
}

function blockedResult(
  count: number,
  requeueAttempt: number
): RateLimitResult {
  if (requeueAttempt >= MAX_REQUEUE_ATTEMPTS) {
    return {
      allowed: false,
      currentCount: count,
      remainingDMs: 0,
      shouldRequeue: false,
      requeueDelayMs: 0,
      shouldSkip: true,
      reserved: false,
    };
  }

  return {
    allowed: false,
    currentCount: count,
    remainingDMs: 0,
    shouldRequeue: true,
    requeueDelayMs: REQUEUE_DELAY_MS,
    shouldSkip: false,
    reserved: false,
  };
}

/**
 * Check if an Instagram account is within its DM rate limit.
 *
 * Uses a Redis counter with a 1-hour TTL per account.
 * Key pattern: `rate:dm:{instagramAccountId}`
 *
 * @param instagramAccountId - The Instagram account ID to check
 * @param requeueAttempt - How many times this job has been requeued (0 = first attempt)
 * @returns Rate limit result with action recommendations
 */
export async function checkRateLimit(
  instagramAccountId: string,
  requeueAttempt: number = 0
): Promise<RateLimitResult> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;

  const currentCount = await client.get(key);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  if (count >= RATE_LIMIT_MAX) {
    // Over the limit
    if (requeueAttempt >= MAX_REQUEUE_ATTEMPTS) {
      // Exceeded max requeue attempts — skip this DM
      return {
        allowed: false,
        currentCount: count,
        remainingDMs: 0,
        shouldRequeue: false,
        requeueDelayMs: 0,
        shouldSkip: true,
        reserved: false,
      };
    }

    return {
      allowed: false,
      currentCount: count,
      remainingDMs: 0,
      shouldRequeue: true,
      requeueDelayMs: REQUEUE_DELAY_MS,
      shouldSkip: false,
      reserved: false,
    };
  }

  return {
    allowed: true,
    currentCount: count,
    remainingDMs: RATE_LIMIT_MAX - count,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: false,
  };
}

/**
 * Atomically reserve a DM send slot for an Instagram account.
 * This is the worker-safe path; it prevents concurrent jobs from all passing
 * the rate-limit check before any of them increments the Redis counter.
 */
export async function reserveDMSlot(
  instagramAccountId: string,
  requeueAttempt: number = 0
): Promise<RateLimitResult> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;

  const result = await client.eval(
    RESERVE_DM_SLOT_SCRIPT,
    1,
    key,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW
  );
  const values = Array.isArray(result) ? result : [];
  const allowedFlag = toScriptNumber(values[0]);
  const count = toScriptNumber(values[1]);
  const remaining = toScriptNumber(values[2]);

  if (allowedFlag !== 1) {
    return blockedResult(count, requeueAttempt);
  }

  return {
    allowed: true,
    currentCount: count,
    remainingDMs: remaining,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: true,
  };
}

/**
 * Backwards-compatible helper for tests and admin scripts.
 * Prefer reserveDMSlot in workers.
 */
export async function incrementDMCounter(
  instagramAccountId: string
): Promise<number> {
  const result = await reserveDMSlot(instagramAccountId, MAX_REQUEUE_ATTEMPTS);
  return result.currentCount;
}

/**
 * Get the current DM count for an Instagram account.
 */
export async function getCurrentDMCount(
  instagramAccountId: string
): Promise<number> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;
  const count = await client.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Reset the rate limiter for an account (useful for testing).
 */
export async function resetRateLimit(
  instagramAccountId: string
): Promise<void> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;
  await client.del(key);
}

// Export constants for use in tests
export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, REQUEUE_DELAY_MS, MAX_REQUEUE_ATTEMPTS };
