import { z } from "zod";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

/** TikTok rejects reply text longer than this. */
export const TIKTOK_REPLY_MAX_LENGTH = 150;
export const TIKTOK_MAX_REPLY_VARIATIONS = 10;

/**
 * Length as a person counts it: an emoji is one character, not two UTF-16
 * units. TikTok documents the limit as "150 characters"; counting code points
 * keeps us at or under it either way for everything but combined emoji.
 */
export function tiktokReplyLength(text: string): number {
  return [...text].length;
}

const replyMessage = z
  .string()
  .trim()
  .min(1)
  .refine((text) => tiktokReplyLength(text) <= TIKTOK_REPLY_MAX_LENGTH, {
    message: `Each reply can be at most ${TIKTOK_REPLY_MAX_LENGTH} characters`,
  });

const campaignFields = {
  name: z.string().trim().min(1).max(100),
  keywords: z.array(z.string().trim().min(1).max(50)).max(10),
  matchAnyWord: z.boolean(),
  wholeWordMatch: z.boolean(),
  matchAnyVideo: z.boolean(),
  videoId: z.string().regex(/^\d+$/).nullable(),
  videoCaption: z.string().max(300).nullable(),
  // Several variations matter on TikTok: many near-identical replies in a
  // short time get flagged as spam and hidden.
  replyMessages: z.array(replyMessage).min(1).max(TIKTOK_MAX_REPLY_VARIATIONS),
  isActive: z.boolean(),
};

export const createTikTokCampaignSchema = z
  .object({
    ...campaignFields,
    tiktokAccountId: z.string().min(1),
    keywords: campaignFields.keywords.default([]),
    matchAnyWord: campaignFields.matchAnyWord.default(false),
    wholeWordMatch: campaignFields.wholeWordMatch.default(true),
    matchAnyVideo: campaignFields.matchAnyVideo.default(false),
    videoId: campaignFields.videoId.optional().default(null),
    videoCaption: campaignFields.videoCaption.optional().default(null),
    isActive: campaignFields.isActive.default(true),
  })
  .refine((d) => d.matchAnyVideo || Boolean(d.videoId), {
    message: "Choose a video, or all videos",
    path: ["videoId"],
  })
  .refine((d) => d.matchAnyWord || d.keywords.length >= 1, {
    message: "Add at least one keyword, or match any word",
    path: ["keywords"],
  });

export const updateTikTokCampaignSchema = z.object(campaignFields).partial();

export interface MatchableTikTokCampaign {
  id: string;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
  matchAnyVideo: boolean;
  videoId: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * The campaign that should answer a comment, or null. A campaign bound to the
 * comment's video wins over an all-videos campaign, then the oldest wins, so
 * the choice is stable however the rows come back.
 */
export function findMatchingTikTokCampaign<T extends MatchableTikTokCampaign>(
  campaigns: T[],
  comment: { videoId: string; text: string }
): { campaign: T; matchedKeyword: string | null } | null {
  const candidates = campaigns
    .filter(
      (c) => c.isActive && (c.matchAnyVideo || c.videoId === comment.videoId)
    )
    .sort(
      (a, b) =>
        Number(a.matchAnyVideo) - Number(b.matchAnyVideo) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );

  for (const campaign of candidates) {
    if (campaign.matchAnyWord) {
      if (comment.text.trim()) return { campaign, matchedKeyword: null };
      continue;
    }
    const result = matchKeywords(
      comment.text,
      campaign.keywords,
      campaign.wholeWordMatch
    );
    if (result.matched) {
      return { campaign, matchedKeyword: result.matchedKeyword };
    }
  }
  return null;
}

/** A random variation, like Instagram public replies. */
export function pickTikTokReply(
  messages: string[],
  random: () => number = Math.random
): string | null {
  const pool = messages.map((m) => m.trim()).filter(Boolean);
  if (pool.length === 0) return null;
  return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}
