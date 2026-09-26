import { describe, expect, it } from "vitest";
import {
  createTikTokCampaignSchema,
  findMatchingTikTokCampaign,
  pickTikTokReply,
  TIKTOK_REPLY_MAX_LENGTH,
  tiktokReplyLength,
  updateTikTokCampaignSchema,
} from "../lib/tiktok/campaigns";

function campaign(overrides: Partial<Parameters<typeof findMatchingTikTokCampaign>[0][number]> = {}) {
  return {
    id: "c1",
    keywords: ["LINK"],
    matchAnyWord: false,
    wholeWordMatch: true,
    matchAnyVideo: true,
    videoId: null,
    isActive: true,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

const VIDEO = "7203946942097902849";

describe("TikTok campaign matching", () => {
  it("uses the Instagram keyword matcher semantics", () => {
    const c = campaign({ keywords: ["preco"] });
    expect(findMatchingTikTokCampaign([c], { videoId: VIDEO, text: "PREÇO?? 🔥" })?.matchedKeyword).toBe("preco");
    expect(findMatchingTikTokCampaign([c], { videoId: VIDEO, text: "precooo" })).toBeNull();
    const partial = campaign({ keywords: ["link"], wholeWordMatch: false });
    expect(findMatchingTikTokCampaign([partial], { videoId: VIDEO, text: "linking" })).not.toBeNull();
  });

  it("only matches the chosen video unless the campaign covers all videos", () => {
    const pinned = campaign({ matchAnyVideo: false, videoId: VIDEO });
    expect(findMatchingTikTokCampaign([pinned], { videoId: VIDEO, text: "link" })).not.toBeNull();
    expect(findMatchingTikTokCampaign([pinned], { videoId: "7203946942097902848", text: "link" })).toBeNull();
  });

  it("prefers a video-specific campaign over an all-videos one", () => {
    const any = campaign({ id: "any", createdAt: new Date("2026-01-01") });
    const pinned = campaign({ id: "pinned", matchAnyVideo: false, videoId: VIDEO });
    expect(findMatchingTikTokCampaign([any, pinned], { videoId: VIDEO, text: "link" })?.campaign.id).toBe("pinned");
  });

  it("skips paused campaigns, and any-word campaigns need some text", () => {
    expect(findMatchingTikTokCampaign([campaign({ isActive: false })], { videoId: VIDEO, text: "link" })).toBeNull();
    const anyWord = campaign({ matchAnyWord: true, keywords: [] });
    expect(findMatchingTikTokCampaign([anyWord], { videoId: VIDEO, text: "hello" })?.matchedKeyword).toBeNull();
    expect(findMatchingTikTokCampaign([anyWord], { videoId: VIDEO, text: "  " })).toBeNull();
  });

  it("picks a reply variation at random and ignores blank ones", () => {
    expect(pickTikTokReply(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickTikTokReply(["a", "b", "c"], () => 0.99)).toBe("c");
    expect(pickTikTokReply([" ", "only"], () => 0)).toBe("only");
    expect(pickTikTokReply([])).toBeNull();
  });
});

describe("TikTok campaign validation", () => {
  const valid = {
    tiktokAccountId: "acct",
    name: "Link drop",
    keywords: ["LINK"],
    matchAnyVideo: true,
    replyMessages: ["Sent! Check the link in our bio 🫡"],
  };

  it("accepts a reply of exactly 150 characters, counting emoji as one", () => {
    const emoji = "🫡".repeat(TIKTOK_REPLY_MAX_LENGTH);
    expect(emoji.length).toBe(300); // UTF-16 units
    expect(tiktokReplyLength(emoji)).toBe(150);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, replyMessages: [emoji] }).success).toBe(true);
  });

  it("rejects a reply over 150 characters, and empty replies", () => {
    const tooLong = "a".repeat(TIKTOK_REPLY_MAX_LENGTH + 1);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, replyMessages: ["ok", tooLong] }).success).toBe(false);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, replyMessages: ["   "] }).success).toBe(false);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, replyMessages: [] }).success).toBe(false);
    expect(updateTikTokCampaignSchema.safeParse({ replyMessages: [tooLong] }).success).toBe(false);
  });

  it("needs a video or all videos, and keywords or any word", () => {
    expect(createTikTokCampaignSchema.safeParse({ ...valid, matchAnyVideo: false }).success).toBe(false);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, matchAnyVideo: false, videoId: VIDEO }).success).toBe(true);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, keywords: [] }).success).toBe(false);
    expect(createTikTokCampaignSchema.safeParse({ ...valid, keywords: [], matchAnyWord: true }).success).toBe(true);
  });

  it("only accepts numeric video ids, so a rounded number cannot sneak in", () => {
    expect(createTikTokCampaignSchema.safeParse({ ...valid, matchAnyVideo: false, videoId: "7.2e18" }).success).toBe(false);
  });
});
