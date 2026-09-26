/**
 * TikTok comment polling.
 *
 * Works with or without a webhook subscription: webhooks arrive "within five
 * minutes" and are dropped after 72 hours of failed deliveries, and a local
 * instance has no public URL for them at all. Each sweep reads the newest page
 * of top-level comments on the videos active campaigns cover, and queues the
 * ones that match a keyword and have no reply log yet. Both paths feed the
 * same worker, whose database claim stops a comment being answered twice.
 *
 * Budget: TikTok allows 40 calls a minute per account per endpoint. A sweep
 * makes at most one video-list call and TIKTOK_POLL_MAX_VIDEOS comment-list
 * calls per account, every TIKTOK_POLL_INTERVAL_MS (default 10 per 5 minutes).
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  listTikTokComments,
  listTikTokVideos,
  TikTokApiError,
  type TikTokComment,
} from "@/lib/tiktok/api";
import { findMatchingTikTokCampaign } from "@/lib/tiktok/campaigns";
import { enqueueTikTokComment } from "@/lib/tiktok/queue";
import { withTikTokToken } from "@/lib/tiktok/tokens";

const MAX_VIDEOS = Number(process.env.TIKTOK_POLL_MAX_VIDEOS ?? 10);
const LOOKBACK_HOURS = Number(process.env.TIKTOK_POLL_LOOKBACK_HOURS ?? 72);

function errorText(error: unknown): string {
  if (error instanceof TikTokApiError) return `TikTok ${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "Unknown error";
}

/** One sweep over every TikTok account with an active campaign. */
export async function pollTikTokComments(): Promise<void> {
  const accounts = await prisma.tikTokAccount.findMany({
    where: { campaigns: { some: { isActive: true } } },
    include: { campaigns: { where: { isActive: true } } },
  });

  for (const account of accounts) {
    const errors: string[] = [];
    let enqueued = 0;
    try {
      enqueued = await sweepAccount(account, errors);
    } catch (error) {
      errors.push(errorText(error));
    }
    if (enqueued === 0 && errors.length === 0) continue;

    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "SYSTEM",
          level: errors.length > 0 ? "WARNING" : "INFO",
          message: `TikTok sweep @${account.username}: ${enqueued} enqueued`,
          payload: { tiktokAccountId: account.id, enqueued, errors },
        },
      })
      .catch(() => {});
  }
}

async function sweepAccount(
  account: Prisma.TikTokAccountGetPayload<{ include: { campaigns: true } }>,
  errors: string[]
): Promise<number> {
  const campaigns = account.campaigns;

  // Pinned videos first, then (for all-videos campaigns) the newest videos.
  const videoIds = new Set(
    campaigns.flatMap((c) => (!c.matchAnyVideo && c.videoId ? [c.videoId] : []))
  );
  if (campaigns.some((c) => c.matchAnyVideo) && videoIds.size < MAX_VIDEOS) {
    const { videos } = await withTikTokToken(account, (token) =>
      listTikTokVideos(token, account.openId, { maxCount: MAX_VIDEOS })
    );
    for (const video of videos) videoIds.add(video.id);
  }

  const sinceSeconds = Math.floor(Date.now() / 1000) - LOOKBACK_HOURS * 3600;
  let enqueued = 0;

  for (const videoId of [...videoIds].slice(0, MAX_VIDEOS)) {
    let comments: TikTokComment[];
    try {
      comments = await withTikTokToken(account, (token) =>
        listTikTokComments(token, account.openId, videoId)
      );
    } catch (error) {
      errors.push(`Comments ${videoId}: ${errorText(error)}`);
      // Throttled: stop this account's sweep instead of making it worse.
      if (error instanceof TikTokApiError && error.isRateLimited) break;
      continue;
    }

    const candidates = comments.filter(
      (c) =>
        !c.owner &&
        !c.parentCommentId &&
        c.createTime >= sinceSeconds &&
        findMatchingTikTokCampaign(campaigns, { videoId, text: c.text })
    );
    if (candidates.length === 0) continue;

    // Skip comments already handled, and replies we posted ourselves.
    const ids = candidates.map((c) => c.commentId);
    const known = await prisma.tikTokReplyLog.findMany({
      where: {
        tiktokAccountId: account.id,
        OR: [{ commentId: { in: ids } }, { replyCommentId: { in: ids } }],
      },
      select: { commentId: true, replyCommentId: true },
    });
    const seen = new Set(
      known.flatMap((row) => [row.commentId, row.replyCommentId ?? ""])
    );

    // Oldest first, so the earliest commenter is answered first.
    for (const c of candidates
      .filter((c) => !seen.has(c.commentId))
      .sort((a, b) => a.createTime - b.createTime)) {
      await enqueueTikTokComment({
        tiktokAccountId: account.id,
        commentId: c.commentId,
        videoId,
        text: c.text,
        commenterName: c.username ?? undefined,
        owner: false,
        source: "POLLING",
      });
      enqueued += 1;
    }
  }
  return enqueued;
}
