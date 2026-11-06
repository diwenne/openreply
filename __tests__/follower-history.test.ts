/**
 * Follower History — Unit Tests
 *
 * Covers the reconstruction of absolute follower totals from the daily
 * net-change deltas that Instagram's follower_count insight returns.
 */

import { describe, it, expect } from "vitest";
import { reconstructFollowerTotals } from "../lib/reports/follower-history";

describe("reconstructFollowerTotals", () => {
  it("walks backwards from the current total", () => {
    // Gained 5 on the 3rd, 3 on the 2nd, 2 on the 1st; 100 followers now.
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-01", delta: 2 },
        { date: "2026-07-02", delta: 3 },
        { date: "2026-07-03", delta: 5 },
      ],
      100
    );

    expect(result).toEqual([
      { date: "2026-07-01", followers: 92 },
      { date: "2026-07-02", followers: 95 },
      { date: "2026-07-03", followers: 100 },
    ]);
  });

  it("returns points in ascending date order regardless of input order", () => {
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-03", delta: 5 },
        { date: "2026-07-01", delta: 2 },
        { date: "2026-07-02", delta: 3 },
      ],
      100
    );

    expect(result.map((r) => r.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("handles follower losses", () => {
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-01", delta: -4 },
        { date: "2026-07-02", delta: 10 },
      ],
      50
    );

    expect(result).toEqual([
      { date: "2026-07-01", followers: 40 },
      { date: "2026-07-02", followers: 50 },
    ]);
  });

  it("truncates the window rather than emitting negative totals", () => {
    // Deltas claim +80 over two days but the account only has 50 followers, so
    // the day before the window would come out negative and must be dropped.
    // The days that survive stay internally consistent: 30 + 20 = 50.
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-01", delta: 60 },
        { date: "2026-07-02", delta: 20 },
      ],
      50
    );

    expect(result.every((r) => r.followers >= 0)).toBe(true);
    expect(result).toEqual([
      { date: "2026-07-01", followers: 30 },
      { date: "2026-07-02", followers: 50 },
    ]);
  });

  it("drops days entirely when even the latest total is unrepresentable", () => {
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-01", delta: 10 },
        { date: "2026-07-02", delta: 10 },
      ],
      -1
    );

    expect(result).toEqual([]);
  });

  it("treats zero-change days as flat", () => {
    const result = reconstructFollowerTotals(
      [
        { date: "2026-07-01", delta: 0 },
        { date: "2026-07-02", delta: 0 },
      ],
      1000
    );

    expect(result).toEqual([
      { date: "2026-07-01", followers: 1000 },
      { date: "2026-07-02", followers: 1000 },
    ]);
  });

  it("returns an empty series for no input", () => {
    expect(reconstructFollowerTotals([], 100)).toEqual([]);
  });
});
