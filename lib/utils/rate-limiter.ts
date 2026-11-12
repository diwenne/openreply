/**
 * Rate Limiter
 *
 * Redis-based rate limiter for Instagram private replies.
 *
 * The cap matches Meta's documented limit for this exact call: 750 private
 * replies per hour per Instagram professional account, for comments on posts
 * and reels. Exceeding it risks 429s and app-level restrictions, so the worker
 * requeues rather than pushing through.
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
 *
 * Note this is a hard ceiling with no headroom. If Meta throttles before the
 * documented limit, or other calls on the same account share the bucket, lower
 * this value.
 */

import Redis from "ioredis";

const RATE_LIMIT_MAX = 750; // private replies per hour, per Meta's documented cap
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const REQUEUE_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_REQUEUE_ATTEMPTS = 3;
// How long an account stops sending after Meta itself refuses a send as rate
// limited. Meta gives no retry-after, and a throttled account that keeps
// sending stays throttled: on a busy post every queued comment then fails in
// turn instead of waiting for the window to clear.
const META_PAUSE_MS = 15 * 60 * 1000;
// Jobs held by a pause resume spread over this window, not all at once.
const META_PAUSE_JITTER_MS = 2 * 60 * 1000;

// Optional pacing (COMMENT_DM_MAX_PER_HOUR). Instagram can refuse every new
// conversation from an account long before Meta's documented cap: one account
// was blocked for hours at about 134 private replies an hour, and again at
// about 85 an hour after some 960 in 12 hours. Pacing
// gives each comment DM its own time slot, evenly spaced, and comments over the
// rate wait in the queue for theirs instead of being dropped.
//
// A paced hold or a hold for a pause is a wait, not a failed try, and a long
// Instagram block re-holds every queued comment once per pause, so these get a
// larger requeue budget than the hourly cap's.
const MAX_HELD_REQUEUE_ATTEMPTS = 48;
// Never schedule further out than this; the comment is skipped instead. A DM a
// day late is already a poor answer, and Instagram stops allowing a private
// reply 7 days after the comment.
const MAX_PACED_HOLD_MS = 24 * 60 * 60 * 1000;
// How far a job may run before or after its slot and still own it. Later than
// that (and never as late as one interval), it takes a new slot.
const SLOT_EARLY_MS = 1000;
const SLOT_LATE_MS = 60 * 1000;

// Account-wide block. Meta answers a private reply with code 100, subcode
// 2534001 ("the thread owner has archived or deleted this conversation") both
// when one commenter has closed their DMs and when Instagram refuses every new
// conversation from the account. Several in a row from different commenters,
// with no delivery between them, means the second: during a block nearly every
// new conversation is refused, while one closed thread shows up about once a
// day. A delivery starts the count again, so on a busy account a few commenters
// who closed their DMs cannot pause it, and each pause needs a fresh burst.
const THREAD_REFUSAL_WINDOW_MS = 10 * 60 * 1000;
const THREAD_REFUSAL_BURST = 3;
// Pause for a block. Sending into it does not end it: the last block lifted
// about half an hour after the retries stopped.
const ACCOUNT_BLOCK_PAUSE_MS = 30 * 60 * 1000;

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
  // Pacing only: the time (ms since epoch) of the slot this hold reserved. The
  // job carries it back, and a job that arrives at its slot sends right away.
  slotAt?: number;
  // Pacing only: another job already holds a slot for this comment, so this one
  // is a duplicate (a sweep or webhook retry) and should leave the DM to it.
  duplicate?: boolean;
}

/**
 * Minimum gap between comment DMs for one account, from COMMENT_DM_MAX_PER_HOUR.
 * 0 when unset, which keeps sending as fast as the hourly cap allows.
 */
export function commentDmIntervalMs(): number {
  const perHour = Number(process.env.COMMENT_DM_MAX_PER_HOUR ?? "");
  if (!Number.isFinite(perHour) || perHour <= 0) return 0;
  return Math.ceil(3_600_000 / Math.min(perHour, RATE_LIMIT_MAX));
}

// With pacing on, KEYS[3] holds when the account's next send slot is free and
// KEYS[4] the slot held for this comment, if any. A job outside a pause that
// arrives at its own slot (ARGV[4]) sends without queueing again. Any other job
// for a comment that already holds a live slot is a duplicate and gets none.
// The rest take the next free slot, which during a pause is after the pause, so
// held jobs come back spaced out rather than at once.
const RESERVE_DM_SLOT_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local interval = tonumber(ARGV[3])
local slot_at = tonumber(ARGV[4])
local now = tonumber(ARGV[5])
local max_hold = tonumber(ARGV[6])
local early = tonumber(ARGV[7])
local late = tonumber(ARGV[8])
local may_hold = tonumber(ARGV[9])

local paused_ms = tonumber(redis.call("PTTL", KEYS[2]))
if paused_ms < 0 then
  paused_ms = 0
end

if interval > 0 then
  local free_at = tonumber(redis.call("GET", KEYS[3]) or "0")
  local owns_slot = paused_ms == 0 and slot_at > 0 and
    slot_at <= now + early and slot_at >= now - late
  if owns_slot then
    redis.call("DEL", KEYS[4])
    -- A late owner still counts as a send now: keep the next one an interval away.
    if free_at < now + interval then
      redis.call("SET", KEYS[3], now + interval, "PX", interval)
    end
  else
    local held = tonumber(redis.call("GET", KEYS[4]) or "0")
    if held > 0 and held ~= slot_at and held >= now - late then
      return {0, current, 0, paused_ms, -2, held}
    end
    if free_at < now + paused_ms then
      free_at = now + paused_ms
    end
    if free_at > now then
      local wait = free_at - now
      -- Skipping: out of holds, or a day deep. Take no slot for it.
      if may_hold == 0 or wait > max_hold then
        return {0, current, 0, paused_ms, -1, 0}
      end
      redis.call("SET", KEYS[3], free_at + interval, "PX", wait + interval)
      redis.call("SET", KEYS[4], free_at, "PX", wait + late + 1000)
      return {0, current, 0, paused_ms, wait, free_at}
    end
    redis.call("DEL", KEYS[4])
    redis.call("SET", KEYS[3], now + interval, "PX", interval)
  end
elseif paused_ms > 0 then
  return {0, current, 0, paused_ms}
end

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
  requeueAttempt: number,
  requeueDelayMs: number = REQUEUE_DELAY_MS,
  maxRequeueAttempts: number = MAX_REQUEUE_ATTEMPTS,
  slotAt?: number
): RateLimitResult {
  if (requeueAttempt >= maxRequeueAttempts) {
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
    requeueDelayMs,
    shouldSkip: false,
    reserved: false,
    ...(slotAt ? { slotAt } : {}),
  };
}

function pauseKey(instagramAccountId: string): string {
  return `rate:dm:pause:${instagramAccountId}`;
}

function nextSlotKey(instagramAccountId: string): string {
  return `rate:dm:next:${instagramAccountId}`;
}

function threadRefusalsKey(instagramAccountId: string): string {
  return `rate:dm:refused:${instagramAccountId}`;
}

function heldCommentKey(instagramAccountId: string, commentId?: string): string {
  return `rate:dm:held:${instagramAccountId}:${commentId ?? "-"}`;
}

// Never shortens a pause already running: a 15-minute rate-limit pause must not
// cut a 30-minute block pause short.
const EXTEND_PAUSE_SCRIPT = `
local remaining = tonumber(redis.call("PTTL", KEYS[1]))
if remaining < tonumber(ARGV[1]) then
  redis.call("SET", KEYS[1], "1", "PX", ARGV[1])
  return 1
end
return 0
`;

/**
 * Stop sending from an account for a while because Meta rate limited it, or
 * because Instagram is refusing new conversations from it.
 *
 * Every reserveDMSlot call for the account is refused until the pause ends,
 * and the job is requeued for when it does, so nothing reaches Meta in the
 * meantime. A later refusal extends the pause from that moment; a shorter one
 * never cuts a running pause short.
 */
export async function pauseDMSends(
  instagramAccountId: string,
  pauseMs: number = META_PAUSE_MS
): Promise<void> {
  await getRedis().eval(EXTEND_PAUSE_SCRIPT, 1, pauseKey(instagramAccountId), pauseMs);
}

// The set holds one member per commenter, so a retry of the same comment does
// not count twice. It is not cleared when a block is found: refusals of sends
// already in flight belong to the same block. It expires a window after the
// last refusal, which is well inside the block pause, so the next pause needs
// a fresh burst.
const RECORD_THREAD_REFUSAL_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call("ZADD", KEYS[1], now, ARGV[4])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
redis.call("PEXPIRE", KEYS[1], window)
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[3]) then
  return 1
end
return 0
`;

/**
 * Record a "thread owner has archived or deleted this conversation" refusal
 * and report whether it is part of an account-wide block: THREAD_REFUSAL_BURST
 * refusals from different commenters within the window, with no delivery
 * between them.
 */
export async function recordThreadRefusal(
  instagramAccountId: string,
  commenterId: string
): Promise<boolean> {
  const result = await getRedis().eval(
    RECORD_THREAD_REFUSAL_SCRIPT,
    1,
    threadRefusalsKey(instagramAccountId),
    Date.now(),
    THREAD_REFUSAL_WINDOW_MS,
    THREAD_REFUSAL_BURST,
    commenterId
  );
  return toScriptNumber(result) === 1;
}

/**
 * A comment DM was delivered, so the account can still open conversations:
 * start the refusal count again.
 */
export async function recordDelivery(instagramAccountId: string): Promise<void> {
  await getRedis().del(threadRefusalsKey(instagramAccountId));
}

const RELEASE_HELD_SLOT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

/**
 * Give up a comment's held slot when no job ended up waiting for it, so later
 * jobs for the comment are not taken for duplicates of a job that does not
 * exist. Only removes it if it still records this slot.
 */
export async function releaseHeldSlot(
  instagramAccountId: string,
  commentId: string,
  slotAt: number
): Promise<void> {
  await getRedis().eval(
    RELEASE_HELD_SLOT_SCRIPT,
    1,
    heldCommentKey(instagramAccountId, commentId),
    String(slotAt)
  );
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
  requeueAttempt: number = 0,
  slotAt: number = 0,
  commentId?: string
): Promise<RateLimitResult> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;

  const interval = commentDmIntervalMs();
  const result = await client.eval(
    RESERVE_DM_SLOT_SCRIPT,
    4,
    key,
    pauseKey(instagramAccountId),
    nextSlotKey(instagramAccountId),
    heldCommentKey(instagramAccountId, commentId),
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW,
    interval,
    slotAt,
    Date.now(),
    MAX_PACED_HOLD_MS,
    SLOT_EARLY_MS,
    // Less than an interval, so a late owner can never land right next to a
    // send that took the free slot after it.
    Math.min(SLOT_LATE_MS, Math.max(SLOT_EARLY_MS, interval - SLOT_EARLY_MS)),
    requeueAttempt < MAX_HELD_REQUEUE_ATTEMPTS ? 1 : 0
  );
  const values = Array.isArray(result) ? result : [];
  const allowedFlag = toScriptNumber(values[0]);
  const count = toScriptNumber(values[1]);
  const remaining = toScriptNumber(values[2]);
  const pausedMs = toScriptNumber(values[3]);

  if (allowedFlag !== 1 && values.length > 4) {
    const holdMs = toScriptNumber(values[4]);
    if (holdMs < 0) {
      return {
        allowed: false,
        currentCount: count,
        remainingDMs: 0,
        shouldRequeue: false,
        requeueDelayMs: 0,
        // -2: another job already holds this comment's slot.
        // -1: the schedule is already a day deep; skip rather than queue further.
        shouldSkip: holdMs !== -2,
        reserved: false,
        ...(holdMs === -2 ? { duplicate: true } : {}),
      };
    }
    return blockedResult(
      count,
      requeueAttempt,
      holdMs,
      MAX_HELD_REQUEUE_ATTEMPTS,
      toScriptNumber(values[5])
    );
  }

  if (allowedFlag !== 1) {
    return pausedMs > 0
      ? blockedResult(
          count,
          requeueAttempt,
          pausedMs + Math.floor(Math.random() * META_PAUSE_JITTER_MS),
          MAX_HELD_REQUEUE_ATTEMPTS
        )
      : blockedResult(count, requeueAttempt);
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
 * Release a DM slot previously taken by reserveDMSlot.
 *
 * reserveDMSlot increments the hourly counter before the send, so concurrent
 * jobs can't all pass the check at once. When that send then fails (closed
 * messaging window, expired token, rejected reply) the reserved slot is never
 * used and must be handed back. Otherwise a comment that never delivers a DM
 * still burns one slot per attempt, and BullMQ's retries burn several. On a
 * post with many failing sends the counter inflates past the real number of
 * DMs and legitimate replies get skipped as rate-limited until the TTL expires.
 *
 * DECR is atomic and preserves the key's TTL, so the hourly window still resets
 * when it originally would. A missing key (the window already rolled over)
 * would decrement to -1 with no expiry, so that case is clamped back to zero.
 */
export async function releaseDMSlot(
  instagramAccountId: string
): Promise<number> {
  const client = getRedis();
  const key = `rate:dm:${instagramAccountId}`;
  const next = await client.decr(key);
  if (next < 0) {
    await client.del(key);
    return 0;
  }
  return next;
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
export {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW,
  REQUEUE_DELAY_MS,
  MAX_REQUEUE_ATTEMPTS,
  META_PAUSE_MS,
  META_PAUSE_JITTER_MS,
  MAX_HELD_REQUEUE_ATTEMPTS,
  MAX_PACED_HOLD_MS,
  THREAD_REFUSAL_WINDOW_MS,
  THREAD_REFUSAL_BURST,
  ACCOUNT_BLOCK_PAUSE_MS,
};
