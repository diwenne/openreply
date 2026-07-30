/**
 * Login Rate Limiter
 *
 * Throttles magic-link requests — the only unauthenticated door of the app.
 * Fixed windows in Redis, keyed by caller IP and by target email, so neither
 * a single machine nor a single mailbox can be hammered.
 *
 * Fails OPEN on Redis errors: the email allowlist is the primary guard, and a
 * Redis outage must not lock the operator out of their own tool.
 */

import { getRedisConnection } from "@/lib/queue/client";

const WINDOW_SECONDS = 15 * 60;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 5;

const TOTP_WINDOW_SECONDS = 5 * 60;
const MAX_TOTP_ATTEMPTS = 5;

export interface LoginAttemptVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

async function bump(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const redis = getRedisConnection();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}

export async function reserveLoginAttempt(
  ip: string | null,
  email: string | null
): Promise<LoginAttemptVerdict> {
  try {
    const checks: Promise<boolean>[] = [];
    if (ip) checks.push(bump(`login:ip:${ip}`, MAX_PER_IP, WINDOW_SECONDS));
    if (email)
      checks.push(bump(`login:email:${email}`, MAX_PER_EMAIL, WINDOW_SECONDS));
    const results = await Promise.all(checks);
    return {
      allowed: results.every(Boolean),
      retryAfterSeconds: WINDOW_SECONDS,
    };
  } catch (error) {
    console.error(
      "[Login rate limiter] Redis unavailable, failing open:",
      error instanceof Error ? error.message : error
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Throttle TOTP verification — 6-digit codes are brute-forceable without
 * this. 5 attempts per 5 minutes per user.
 */
export async function reserveTotpAttempt(
  userId: string
): Promise<LoginAttemptVerdict> {
  try {
    const allowed = await bump(
      `totp:verify:${userId}`,
      MAX_TOTP_ATTEMPTS,
      TOTP_WINDOW_SECONDS
    );
    return { allowed, retryAfterSeconds: TOTP_WINDOW_SECONDS };
  } catch (error) {
    console.error(
      "[TOTP rate limiter] Redis unavailable, failing open:",
      error instanceof Error ? error.message : error
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
