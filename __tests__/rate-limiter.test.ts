/**
 * Rate Limiter — Unit Tests
 *
 * Tests the hourly private-reply cap enforcement using mocked Redis.
 * Assertions derive from RATE_LIMIT_MAX so they survive a change to the cap.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGet, mockEval, mockDel, mockDecr, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockEval: vi.fn(),
  mockDel: vi.fn(),
  mockDecr: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (
    this: Record<string, unknown>
  ) {
    this.get = mockGet;
    this.eval = mockEval;
    this.del = mockDel;
    this.decr = mockDecr;
    this.set = mockSet;
    return this;
  });
  return { default: MockRedis };
});

vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import {
  checkRateLimit,
  incrementDMCounter,
  reserveDMSlot,
  releaseDMSlot,
  pauseDMSends,
  recordThreadRefusal,
  recordDelivery,
  commentDmIntervalMs,
  RATE_LIMIT_MAX,
  REQUEUE_DELAY_MS,
  META_PAUSE_MS,
  META_PAUSE_JITTER_MS,
  MAX_HELD_REQUEUE_ATTEMPTS,
  MAX_PACED_HOLD_MS,
  THREAD_REFUSAL_WINDOW_MS,
  THREAD_REFUSAL_BURST,
} from "../lib/utils/rate-limiter";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("should allow when count is below limit", async () => {
    mockGet.mockResolvedValue("50");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 50);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(false);
    expect(result.reserved).toBe(false);
  });

  it("should allow when no previous count exists", async () => {
    mockGet.mockResolvedValue(null);

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX);
  });

  it("should deny when count reaches the limit", async () => {
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("should skip after max requeue attempts", async () => {
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("reserveDMSlot", () => {
  it("should atomically reserve a slot when below the hourly cap", async () => {
    mockEval.mockResolvedValue([1, 51, 139]);

    const result = await reserveDMSlot("account_123");

    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      4,
      "rate:dm:account_123",
      "rate:dm:pause:account_123",
      "rate:dm:next:account_123",
      "rate:dm:held:account_123:-",
      RATE_LIMIT_MAX,
      3600,
      0, // pacing off unless COMMENT_DM_MAX_PER_HOUR is set
      0,
      expect.any(Number),
      MAX_PACED_HOLD_MS,
      expect.any(Number),
      expect.any(Number),
      1 // may still hold
    );
    expect(result.allowed).toBe(true);
    expect(result.reserved).toBe(true);
    expect(result.currentCount).toBe(51);
    expect(result.remainingDMs).toBe(139);
  });

  it("should recommend requeue when the atomic reserve is denied", async () => {
    mockEval.mockResolvedValue([0, RATE_LIMIT_MAX, 0]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
    expect(result.requeueDelayMs).toBe(REQUEUE_DELAY_MS);
  });

  it("should hold sends while the account is paused, until the pause ends", async () => {
    mockEval.mockResolvedValue([0, 12, 0, 240_000]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.requeueDelayMs).toBeGreaterThanOrEqual(240_000);
    expect(result.requeueDelayMs).toBeLessThan(240_000 + META_PAUSE_JITTER_MS);
  });

  it("keeps holding through a long pause, not only three times", async () => {
    mockEval.mockResolvedValue([0, 12, 0, 240_000]);

    expect((await reserveDMSlot("account_123", 3)).shouldRequeue).toBe(true);
    expect(
      (await reserveDMSlot("account_123", MAX_HELD_REQUEUE_ATTEMPTS)).shouldSkip
    ).toBe(true);
  });

  it("should skip after max requeue attempts", async () => {
    mockEval.mockResolvedValue(["0", String(RATE_LIMIT_MAX), "0"]);

    const result = await reserveDMSlot("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("incrementDMCounter", () => {
  it("should use the atomic reservation path", async () => {
    mockEval.mockResolvedValue([1, 51, 139]);

    const count = await incrementDMCounter("account_123");

    expect(mockEval).toHaveBeenCalled();
    expect(count).toBe(51);
  });
});

describe("releaseDMSlot", () => {
  it("hands a reserved slot back and returns the new count", async () => {
    mockDecr.mockResolvedValue(49);

    const count = await releaseDMSlot("account_123");

    expect(mockDecr).toHaveBeenCalledWith("rate:dm:account_123");
    expect(count).toBe(49);
  });

  it("clamps to zero and clears the key when nothing was reserved", async () => {
    mockDecr.mockResolvedValue(-1);

    const count = await releaseDMSlot("account_123");

    expect(count).toBe(0);
    expect(mockDel).toHaveBeenCalledWith("rate:dm:account_123");
  });
});

describe("pauseDMSends", () => {
  it("pauses the account, never shortening a pause already running", async () => {
    mockEval.mockResolvedValue(1);

    await pauseDMSends("account_123");

    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining("PTTL"),
      1,
      "rate:dm:pause:account_123",
      META_PAUSE_MS
    );
  });
});

describe("commentDmIntervalMs", () => {
  afterEach(() => {
    delete process.env.COMMENT_DM_MAX_PER_HOUR;
  });

  it("is off when COMMENT_DM_MAX_PER_HOUR is unset or invalid", () => {
    expect(commentDmIntervalMs()).toBe(0);
    process.env.COMMENT_DM_MAX_PER_HOUR = "lots";
    expect(commentDmIntervalMs()).toBe(0);
    process.env.COMMENT_DM_MAX_PER_HOUR = "0";
    expect(commentDmIntervalMs()).toBe(0);
  });

  it("spaces sends evenly across the hour", () => {
    process.env.COMMENT_DM_MAX_PER_HOUR = "90";
    expect(commentDmIntervalMs()).toBe(40_000);
  });

  it("never paces looser than the hourly cap", () => {
    process.env.COMMENT_DM_MAX_PER_HOUR = String(RATE_LIMIT_MAX * 10);
    expect(commentDmIntervalMs()).toBe(Math.ceil(3_600_000 / RATE_LIMIT_MAX));
  });
});

describe("reserveDMSlot with pacing", () => {
  afterEach(() => {
    delete process.env.COMMENT_DM_MAX_PER_HOUR;
  });

  it("passes the interval and the job's slot to the script", async () => {
    process.env.COMMENT_DM_MAX_PER_HOUR = "90";
    mockEval.mockResolvedValue([1, 5, RATE_LIMIT_MAX - 5]);

    const result = await reserveDMSlot("account_123", 1, 1_800_000_040_000, "c_1");

    expect(result.allowed).toBe(true);
    const args = mockEval.mock.calls[0];
    expect(args[5]).toBe("rate:dm:held:account_123:c_1");
    expect(args[7]).toBe(3600);
    expect(args[8]).toBe(40_000);
    expect(args[9]).toBe(1_800_000_040_000);
    // A late owner keeps its slot for less than one interval.
    expect(args[13]).toBe(39_000);
    expect(args[14]).toBe(1);
  });

  it("tells the script not to hold once the hold budget is spent", async () => {
    process.env.COMMENT_DM_MAX_PER_HOUR = "90";
    mockEval.mockResolvedValue([0, 5, 0, 0, -1, 0]);

    const result = await reserveDMSlot("account_123", MAX_HELD_REQUEUE_ATTEMPTS, 0, "c_1");

    expect(mockEval.mock.calls[0][14]).toBe(0);
    expect(result.shouldSkip).toBe(true);
  });

  it("holds a comment for its slot and returns the slot", async () => {
    mockEval.mockResolvedValue([0, 5, 0, 0, 40_000, 1_800_000_040_000]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.requeueDelayMs).toBe(40_000);
    expect(result.slotAt).toBe(1_800_000_040_000);
  });

  it("allows more holds than the unpaced requeue budget", async () => {
    mockEval.mockResolvedValue([0, 5, 0, 600_000, 640_000, 1_800_000_640_000]);

    expect((await reserveDMSlot("account_123", 3)).shouldRequeue).toBe(true);
    expect(
      (await reserveDMSlot("account_123", MAX_HELD_REQUEUE_ATTEMPTS)).shouldSkip
    ).toBe(true);
  });

  it("flags a job for a comment that already holds a slot as a duplicate", async () => {
    mockEval.mockResolvedValue([0, 5, 0, 0, -2, 1_800_000_040_000]);

    const result = await reserveDMSlot("account_123", 0, 0, "c_1");

    expect(result.duplicate).toBe(true);
    expect(result.shouldSkip).toBe(false);
    expect(result.shouldRequeue).toBe(false);
  });

  it("skips a comment when the schedule is already a day deep", async () => {
    mockEval.mockResolvedValue([0, 5, 0, 0, -1, 0]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.shouldSkip).toBe(true);
    expect(result.shouldRequeue).toBe(false);
  });
});

describe("account-wide block", () => {
  it("records a refusal per commenter and reports a block", async () => {
    mockEval.mockResolvedValue(1);

    await expect(recordThreadRefusal("account_123", "commenter_1")).resolves.toBe(true);
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "rate:dm:refused:account_123",
      expect.any(Number),
      THREAD_REFUSAL_WINDOW_MS,
      THREAD_REFUSAL_BURST,
      "commenter_1"
    );
  });

  it("reports no block for an isolated refusal", async () => {
    mockEval.mockResolvedValue(0);

    await expect(recordThreadRefusal("account_123", "commenter_1")).resolves.toBe(false);
  });

  it("starts the refusal count again on a delivery", async () => {
    mockDel.mockResolvedValue(1);

    await recordDelivery("account_123");
    expect(mockDel).toHaveBeenCalledWith("rate:dm:refused:account_123");
  });
});
