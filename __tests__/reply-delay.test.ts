import { describe, expect, it } from "vitest";
import {
  MAX_REPLY_DELAY_SECONDS,
  normalizeDelayRange,
  randomDelayMs,
} from "../lib/queue/reply-delay";

describe("reply delay", () => {
  it("sends immediately when both ends of the range are zero", () => {
    expect(randomDelayMs({ minSeconds: 0, maxSeconds: 0 })).toBe(0);
  });

  it("treats a single-value range as a fixed delay", () => {
    expect(randomDelayMs({ minSeconds: 45, maxSeconds: 45 })).toBe(45_000);
  });

  it("draws across the whole range, including both ends", () => {
    const range = { minSeconds: 10, maxSeconds: 20 };
    expect(randomDelayMs(range, () => 0)).toBe(10_000);
    expect(randomDelayMs(range, () => 0.5)).toBe(15_000);
    expect(randomDelayMs(range, () => 0.999_999)).toBe(20_000);
  });

  it("never leaves the configured range, whatever the draw", () => {
    const range = { minSeconds: 5, maxSeconds: 90 };
    for (let i = 0; i < 1_000; i += 1) {
      const delay = randomDelayMs(range);
      expect(delay).toBeGreaterThanOrEqual(5_000);
      expect(delay).toBeLessThanOrEqual(90_000);
      expect(delay % 1_000).toBe(0);
    }
  });

  it("swaps a reversed range instead of rejecting it", () => {
    expect(normalizeDelayRange({ minSeconds: 30, maxSeconds: 10 })).toEqual({
      minSeconds: 10,
      maxSeconds: 30,
    });
    expect(randomDelayMs({ minSeconds: 30, maxSeconds: 10 }, () => 0.5)).toBe(
      20_000
    );
  });

  it("clamps negative and oversized values into the allowed window", () => {
    expect(normalizeDelayRange({ minSeconds: -5, maxSeconds: 10 })).toEqual({
      minSeconds: 0,
      maxSeconds: 10,
    });
    expect(
      normalizeDelayRange({
        minSeconds: 10,
        maxSeconds: MAX_REPLY_DELAY_SECONDS + 500,
      })
    ).toEqual({ minSeconds: 10, maxSeconds: MAX_REPLY_DELAY_SECONDS });
  });

  it("falls back to zero for values that are not numbers", () => {
    expect(
      normalizeDelayRange({ minSeconds: Number.NaN, maxSeconds: 15 })
    ).toEqual({ minSeconds: 0, maxSeconds: 15 });
    expect(randomDelayMs({ minSeconds: Number.POSITIVE_INFINITY, maxSeconds: 0 })).toBe(0);
  });
});
