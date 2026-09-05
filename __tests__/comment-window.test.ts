import { describe, expect, it } from "vitest";
import {
  getCampaignCommentSinceMs,
  shouldProcessCommentForCampaign,
} from "../lib/polling/comment-window";

describe("campaign comment polling window", () => {
  it("does not poll comments from before the campaign was created", () => {
    const lookback = Date.parse("2026-09-01T00:00:00.000Z");
    const createdAt = new Date("2026-09-03T12:00:00.000Z");

    expect(getCampaignCommentSinceMs(lookback, createdAt)).toBe(
      createdAt.getTime()
    );
  });

  it("still respects the configured lookback for older campaigns", () => {
    const lookback = Date.parse("2026-09-01T00:00:00.000Z");
    const createdAt = new Date("2026-08-01T00:00:00.000Z");

    expect(getCampaignCommentSinceMs(lookback, createdAt)).toBe(lookback);
  });
});

describe("shouldProcessCommentForCampaign", () => {
  const campaignCreatedAt = new Date("2026-09-05T12:00:00.000Z");

  it("allows live webhook jobs without requiring a timestamp", () => {
    expect(
      shouldProcessCommentForCampaign("WEBHOOK", undefined, campaignCreatedAt)
    ).toBe(true);
  });

  it("allows polling comments created after the campaign", () => {
    expect(
      shouldProcessCommentForCampaign(
        "POLLING",
        "2026-09-05T12:00:01.000Z",
        campaignCreatedAt
      )
    ).toBe(true);
  });

  it("rejects polling comments created before the campaign", () => {
    expect(
      shouldProcessCommentForCampaign(
        "POLLING",
        "2026-09-05T11:59:59.000Z",
        campaignCreatedAt
      )
    ).toBe(false);
  });

  it("rejects legacy polling jobs that do not have a timestamp", () => {
    expect(
      shouldProcessCommentForCampaign("POLLING", undefined, campaignCreatedAt)
    ).toBe(false);
  });
});
