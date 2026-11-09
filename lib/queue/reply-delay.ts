/**
 * Randomized reply pacing.
 *
 * A fixed delay still reads as automation: every comment is answered exactly
 * N seconds after it arrives. Drawing each wait from a per-account range keeps
 * the timing plausible without letting the delay grow unbounded.
 *
 * The draw happens once, at enqueue time, and travels to the worker inside the
 * BullMQ job. A job therefore keeps the delay it was scheduled with no matter
 * how often the webhook is retried, and no worker slot is ever held by a
 * `sleep`.
 */

/** Upper bound for either end of a range: one hour. */
export const MAX_REPLY_DELAY_SECONDS = 60 * 60;

export interface ReplyDelayRange {
  minSeconds: number;
  maxSeconds: number;
}

function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_REPLY_DELAY_SECONDS, Math.floor(value)));
}

/**
 * Keeps a range usable no matter what reached the database: negative numbers
 * become 0, values above the cap are clamped, and a reversed range (max below
 * min) is swapped rather than rejected.
 */
export function normalizeDelayRange(range: ReplyDelayRange): ReplyDelayRange {
  const a = clampSeconds(range.minSeconds);
  const b = clampSeconds(range.maxSeconds);
  return a <= b
    ? { minSeconds: a, maxSeconds: b }
    : { minSeconds: b, maxSeconds: a };
}

/**
 * A delay in milliseconds, uniformly drawn from `[minSeconds, maxSeconds]` and
 * inclusive of both ends. A single-value range behaves like a fixed delay and
 * `0/0` returns 0, so installs that never configure pacing keep today's
 * send-immediately behaviour.
 *
 * `random` is injectable so tests can pin the draw.
 */
export function randomDelayMs(
  range: ReplyDelayRange,
  random: () => number = Math.random
): number {
  const { minSeconds, maxSeconds } = normalizeDelayRange(range);
  if (maxSeconds === 0) return 0;
  const span = maxSeconds - minSeconds;
  const drawn = minSeconds + Math.floor(random() * (span + 1));
  return drawn * 1000;
}
