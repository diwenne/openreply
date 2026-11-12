/**
 * Rate limiter — the Lua scripts on a real Redis.
 *
 * The unit tests mock `eval`, so they cannot see what the scripts do. These run
 * them for real. Skipped unless TEST_REDIS_URL points at a disposable Redis:
 *
 *   redis-server --port 6390 --save "" --daemonize yes
 *   TEST_REDIS_URL=redis://127.0.0.1:6390 npx vitest run __tests__/rate-limiter-redis.test.ts
 */
import { randomBytes } from "node:crypto";
import Redis from "ioredis";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisUrl = process.env.TEST_REDIS_URL;
if (redisUrl) process.env.REDIS_URL = redisUrl;

const rl = await import("../lib/utils/rate-limiter");

describe.skipIf(!redisUrl)("rate limiter scripts on Redis", () => {
  const redis = redisUrl ? new Redis(redisUrl) : (null as unknown as Redis);
  const T0 = 1_800_000_000_000;
  let ig = "";

  const at = (ms: number) => vi.setSystemTime(T0 + ms);
  // The pause TTL runs on Redis's own clock, which a fake Date does not move.
  const endPause = () => redis.del(`rate:dm:pause:${ig}`);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    ig = `test_${randomBytes(6).toString("hex")}`;
  });

  afterEach(async () => {
    vi.useRealTimers();
    const keys = await redis.keys(`rate:dm:*${ig}*`);
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis?.quit();
  });

  describe("a pause", () => {
    it("sends right away, and holds for a pause", async () => {
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(true);
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(true);
      await rl.pauseDMSends(ig, 600_000);
      const held = await rl.reserveDMSlot(ig);
      expect(held.shouldRequeue).toBe(true);
      expect(held.requeueDelayMs).toBeGreaterThan(590_000);
    });

    it("sends again once the pause ends", async () => {
      await rl.pauseDMSends(ig, 600_000);
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(false);
      await endPause();
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(true);
    });
  });

  describe("pauseDMSends", () => {
    it("extends a pause but never shortens it", async () => {
      await rl.pauseDMSends(ig, 1_800_000);
      await rl.pauseDMSends(ig, 900_000);
      expect(await redis.pttl(`rate:dm:pause:${ig}`)).toBeGreaterThan(1_700_000);
      await rl.pauseDMSends(ig, 3_600_000);
      expect(await redis.pttl(`rate:dm:pause:${ig}`)).toBeGreaterThan(3_500_000);
    });
  });
});
