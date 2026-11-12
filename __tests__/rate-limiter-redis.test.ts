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
    delete process.env.COMMENT_DM_MAX_PER_HOUR;
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.COMMENT_DM_MAX_PER_HOUR;
    const keys = await redis.keys(`rate:dm:*${ig}*`);
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await redis?.quit();
  });

  describe("without pacing", () => {
    it("sends right away, and holds for a pause", async () => {
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(true);
      expect((await rl.reserveDMSlot(ig)).allowed).toBe(true);
      await rl.pauseDMSends(ig, 600_000);
      const held = await rl.reserveDMSlot(ig);
      expect(held.shouldRequeue).toBe(true);
      expect(held.requeueDelayMs).toBeGreaterThan(590_000);
      expect(held.slotAt).toBeUndefined();
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

  describe("with pacing at 90/hour", () => {
    beforeEach(() => {
      process.env.COMMENT_DM_MAX_PER_HOUR = "90"; // 40 s apart
    });

    it("spaces comments 40 s apart, in arrival order", async () => {
      expect((await rl.reserveDMSlot(ig, 0, 0, "c1")).allowed).toBe(true);
      const a = await rl.reserveDMSlot(ig, 0, 0, "c2");
      const b = await rl.reserveDMSlot(ig, 0, 0, "c3");
      expect([a.requeueDelayMs, a.slotAt]).toEqual([40_000, T0 + 40_000]);
      expect([b.requeueDelayMs, b.slotAt]).toEqual([80_000, T0 + 80_000]);

      at(40_000);
      expect((await rl.reserveDMSlot(ig, 1, a.slotAt, "c2")).allowed).toBe(true);
      expect((await rl.reserveDMSlot(ig, 0, 0, "c4")).slotAt).toBe(T0 + 120_000);
    });

    it("lets a late owner send but keeps the next send an interval away", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c1");
      const a = await rl.reserveDMSlot(ig, 0, 0, "c2");
      at(40_000 + 30_000); // 30 s late, within the grace
      expect((await rl.reserveDMSlot(ig, 1, a.slotAt, "c2")).allowed).toBe(true);
      const next = await rl.reserveDMSlot(ig, 0, 0, "c3");
      expect(next.allowed).toBe(false);
      expect(next.requeueDelayMs).toBe(40_000);
    });

    it("never lets a late owner send right after a comment that took the free slot", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c1");
      const a = await rl.reserveDMSlot(ig, 0, 0, "c2"); // slot 40 s; next free 80 s
      at(85_000);
      expect((await rl.reserveDMSlot(ig, 0, 0, "c3")).allowed).toBe(true);
      at(85_500); // c2 arrives 45.5 s late: more than an interval, so a new slot
      const late = await rl.reserveDMSlot(ig, 1, a.slotAt, "c2");
      expect(late.allowed).toBe(false);
      expect(late.slotAt).toBe(T0 + 125_000);
    });

    it("takes no slot for a comment that is out of holds", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c1");
      const before = await redis.get(`rate:dm:next:${ig}`);
      const res = await rl.reserveDMSlot(ig, rl.MAX_HELD_REQUEUE_ATTEMPTS, 0, "c2");
      expect(res.shouldSkip).toBe(true);
      expect(await redis.get(`rate:dm:next:${ig}`)).toBe(before);
      expect(await redis.exists(`rate:dm:held:${ig}:c2`)).toBe(0);
    });

    it("releases a held slot only if it is still the one recorded", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c0");
      const held = await rl.reserveDMSlot(ig, 0, 0, "c1");
      await rl.releaseHeldSlot(ig, "c1", held.slotAt! + 1);
      expect(await redis.exists(`rate:dm:held:${ig}:c1`)).toBe(1);
      await rl.releaseHeldSlot(ig, "c1", held.slotAt!);
      expect(await redis.exists(`rate:dm:held:${ig}:c1`)).toBe(0);
      expect((await rl.reserveDMSlot(ig, 0, 0, "c1")).duplicate).toBeUndefined();
    });

    it("re-slots a job that comes back long after its slot instead of bursting", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c1");
      const a = await rl.reserveDMSlot(ig, 0, 0, "c2");
      at(40_000 + 5 * 60_000); // the worker was down
      expect((await rl.reserveDMSlot(ig, 1, a.slotAt, "c2")).allowed).toBe(true);
      expect((await rl.reserveDMSlot(ig, 1, a.slotAt, "c3")).requeueDelayMs).toBe(40_000);
    });

    it("gives a comment one slot, and none to its duplicate jobs", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c0");
      const held = await rl.reserveDMSlot(ig, 0, 0, "c1");
      // A sweep or webhook retry for the same comment, before its slot.
      at(10_000);
      const dup = await rl.reserveDMSlot(ig, 0, 0, "c1");
      expect(dup.duplicate).toBe(true);
      expect(dup.shouldRequeue).toBe(false);
      // It took no slot: the next comment still gets the slot after c1's.
      expect((await rl.reserveDMSlot(ig, 0, 0, "c2")).slotAt).toBe(T0 + 80_000);
      // The owner still sends at its slot, and afterwards c1 is free again.
      at(40_000);
      expect((await rl.reserveDMSlot(ig, 1, held.slotAt, "c1")).allowed).toBe(true);
      expect((await rl.reserveDMSlot(ig, 0, 0, "c1")).duplicate).toBeUndefined();
    });

    it("re-holds the owner when a pause covers its slot, and still blocks duplicates", async () => {
      await rl.reserveDMSlot(ig, 0, 0, "c0");
      const held = await rl.reserveDMSlot(ig, 0, 0, "c1");
      await rl.pauseDMSends(ig, 1_800_000);
      at(40_000);
      const again = await rl.reserveDMSlot(ig, 1, held.slotAt, "c1");
      expect(again.allowed).toBe(false);
      expect(again.slotAt).toBeGreaterThanOrEqual(T0 + 1_800_000);
      expect((await rl.reserveDMSlot(ig, 0, 0, "c1")).duplicate).toBe(true);
    });

    it("resumes held comments one by one after a pause", async () => {
      await rl.pauseDMSends(ig, 1_800_000);
      const h1 = await rl.reserveDMSlot(ig, 0, 0, "c1");
      const h2 = await rl.reserveDMSlot(ig, 0, 0, "c2");
      const h3 = await rl.reserveDMSlot(ig, 0, 0, "c3");
      expect(h1.slotAt! - T0).toBeGreaterThanOrEqual(1_799_000);
      expect(h2.slotAt! - h1.slotAt!).toBe(40_000);
      expect(h3.slotAt! - h2.slotAt!).toBe(40_000);

      at(h1.slotAt! - T0);
      await endPause();
      expect((await rl.reserveDMSlot(ig, 1, h1.slotAt, "c1")).allowed).toBe(true);
    });

    it("skips rather than schedule more than a day out, without taking a slot", async () => {
      const far = String(T0 + 25 * 3_600_000);
      await redis.set(`rate:dm:next:${ig}`, far);
      const res = await rl.reserveDMSlot(ig, 0, 0, "c1");
      expect(res.shouldSkip).toBe(true);
      expect(await redis.get(`rate:dm:next:${ig}`)).toBe(far);
    });
  });

  describe("account-wide block", () => {
    it("needs refusals from three different commenters within the window", async () => {
      expect(await rl.recordThreadRefusal(ig, "A")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "A")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "B")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "C")).toBe(true);
    });

    it("lets old refusals leave the window", async () => {
      await rl.recordThreadRefusal(ig, "A");
      await rl.recordThreadRefusal(ig, "B");
      at(11 * 60_000);
      expect(await rl.recordThreadRefusal(ig, "C")).toBe(false);
    });

    it("counts refusals of sends already in flight as the same block", async () => {
      for (const c of ["A", "B", "C"]) await rl.recordThreadRefusal(ig, c);
      at(60_000);
      expect(await rl.recordThreadRefusal(ig, "D")).toBe(true);
    });

    it("needs a fresh burst after a block pause", async () => {
      for (const c of ["A", "B", "C"]) await rl.recordThreadRefusal(ig, c);
      at(31 * 60_000);
      expect(await rl.recordThreadRefusal(ig, "D")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "E")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "F")).toBe(true);
    });

    it("starts the count again after any delivery", async () => {
      await rl.recordThreadRefusal(ig, "A");
      await rl.recordThreadRefusal(ig, "B");
      await rl.recordDelivery(ig);
      expect(await rl.recordThreadRefusal(ig, "C")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "D")).toBe(false);
      expect(await rl.recordThreadRefusal(ig, "E")).toBe(true);
    });

    it("never adds up refusals separated by deliveries", async () => {
      for (const c of ["A", "B", "C", "D"]) {
        expect(await rl.recordThreadRefusal(ig, c)).toBe(false);
        await rl.recordDelivery(ig);
      }
    });
  });
});
