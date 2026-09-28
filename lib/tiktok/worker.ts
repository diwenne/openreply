/**
 * TikTok comment worker: match a comment to a campaign and post one public
 * reply.
 *
 * TikTok's reply endpoint has no idempotency key, so the order matters:
 *   1. work out everything that can fail without side effects (campaign, the
 *      comment's author and text, the rate limit);
 *   2. claim the comment with a unique TikTokReplyLog row;
 *   3. call reply/create exactly once.
 * A definite rejection is recorded as FAILED. A timeout, a lost response or a
 * TikTok-side 5xxxx error is recorded as UNCONFIRMED and never retried: the
 * reply may be live, and a second attempt would post it twice.
 */

import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { releaseRateSlot, reserveRateSlot } from "@/lib/utils/rate-limiter";
import {
  getTikTokComment,
  replyToTikTokComment,
  TikTokApiError,
  TikTokTransportError,
} from "@/lib/tiktok/api";
import {
  findMatchingTikTokCampaign,
  pickTikTokReply,
} from "@/lib/tiktok/campaigns";
import {
  enqueueTikTokComment,
  TIKTOK_QUEUE_NAME,
  type TikTokCommentJob,
} from "@/lib/tiktok/queue";
import { withTikTokToken } from "@/lib/tiktok/tokens";

// TikTok allows 40 calls a minute per account per endpoint. Stay well under
// it: bursts of near-identical replies are also what TikTok flags as spam.
const REPLIES_PER_MINUTE = Number(process.env.TIKTOK_REPLIES_PER_MINUTE ?? 10);
// When TikTok itself throttles (40100 and friends) it asks for a five-minute
// pause for per-minute limits.
const THROTTLED_DELAY_MS = 5 * 60 * 1000;
const MAX_REQUEUES = 20;

export type TikTokCommentOutcome =
  | "ignored"
  | "no_match"
  | "duplicate"
  | "skipped"
  | "requeued"
  | "replied"
  | "failed"
  | "unconfirmed";

function errorText(error: unknown): string {
  if (error instanceof TikTokApiError) return `TikTok ${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requeue(
  data: TikTokCommentJob,
  delayMs: number
): Promise<boolean> {
  const attempt = (data.requeueAttempt ?? 0) + 1;
  if (attempt > MAX_REQUEUES) return false;
  await enqueueTikTokComment({ ...data, requeueAttempt: attempt }, delayMs);
  return true;
}

export async function processTikTokComment(
  data: TikTokCommentJob
): Promise<TikTokCommentOutcome> {
  const account = await prisma.tikTokAccount.findUnique({
    where: { id: data.tiktokAccountId },
  });
  if (!account) return "ignored";

  // A reply we posted ourselves, coming back through polling or a webhook.
  const ownReply = await prisma.tikTokReplyLog.findFirst({
    where: { tiktokAccountId: account.id, replyCommentId: data.commentId },
    select: { id: true },
  });
  if (ownReply) return "ignored";

  const campaigns = await prisma.tikTokCampaign.findMany({
    where: {
      tiktokAccountId: account.id,
      isActive: true,
      OR: [{ matchAnyVideo: true }, { videoId: data.videoId }],
    },
  });
  const comment = { videoId: data.videoId, text: data.text ?? "" };
  // Match on the text we already have before spending an API call on a
  // comment no campaign wants.
  if (
    campaigns.length === 0 ||
    (data.text !== undefined && !findMatchingTikTokCampaign(campaigns, comment))
  ) {
    return "no_match";
  }

  let owner = data.owner;
  let commenterName = data.commenterName ?? null;
  if (owner === undefined || data.text === undefined) {
    // The webhook says nothing about who wrote the comment, and TikTok's only
    // self-authorship signal is `owner` on the comment list. Look it up.
    let found;
    try {
      found = await withTikTokToken(account, (token) =>
        getTikTokComment(token, account.openId, data.videoId, data.commentId)
      );
    } catch (error) {
      if (error instanceof TikTokApiError && error.isRateLimited) {
        return (await requeue(data, THROTTLED_DELAY_MS)) ? "requeued" : "failed";
      }
      if (error instanceof TikTokApiError && error.isNotFound) return "no_match";
      // Nothing was claimed or posted, so failing the job is safe; the next
      // polling sweep can pick the comment up again.
      throw error;
    }
    // Deleted, or no longer visible: nothing to answer.
    if (!found || found.parentCommentId) return "no_match";
    if (found.status && found.status !== "PUBLIC") return "no_match";
    owner = found.owner;
    comment.text = found.text;
    commenterName = found.username ?? commenterName;
  }

  const logBase = {
    workspaceId: account.workspaceId,
    tiktokAccountId: account.id,
    commentId: data.commentId,
    videoId: data.videoId,
    commentText: comment.text,
    commenterName,
    source: data.source,
  };

  if (owner) {
    // Recorded so later webhooks and sweeps skip it without another lookup.
    await prisma.tikTokReplyLog
      .create({
        data: { ...logBase, status: "SKIPPED", errorMessage: "Own comment" },
      })
      .catch((error) => {
        if (!isUniqueViolation(error)) throw error;
      });
    return "skipped";
  }

  const match = findMatchingTikTokCampaign(campaigns, comment);
  const replyText = match ? pickTikTokReply(match.campaign.replyMessages) : null;
  if (!match || !replyText) return "no_match";

  const rateKey = `rate:tiktok-reply:${account.id}`;
  const slot = await reserveRateSlot(rateKey, REPLIES_PER_MINUTE, 60);
  if (!slot.allowed) {
    // Spread the backlog out instead of waking every queued job at once.
    const delay = 60_000 + Math.floor(Math.random() * 60_000);
    if (await requeue(data, delay)) return "requeued";
  }

  let logId: string;
  try {
    const log = await prisma.tikTokReplyLog.create({
      data: {
        ...logBase,
        campaignId: match.campaign.id,
        replyText,
        status: slot.allowed ? "PENDING" : "FAILED",
        errorMessage: slot.allowed ? null : "Reply rate limit reached",
      },
      select: { id: true },
    });
    logId = log.id;
  } catch (error) {
    if (slot.allowed) await releaseRateSlot(rateKey).catch(() => {});
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
  if (!slot.allowed) return "failed";

  try {
    const result = await withTikTokToken(account, (token) =>
      replyToTikTokComment(token, account.openId, {
        videoId: data.videoId,
        commentId: data.commentId,
        text: replyText,
      })
    );
    await prisma.tikTokReplyLog.update({
      where: { id: logId },
      data: {
        status: "REPLIED",
        replyCommentId: result.replyCommentId,
        repliedAt: new Date(),
      },
    });
    return "replied";
  } catch (error) {
    if (error instanceof TikTokApiError && error.isRateLimited) {
      // A definite rejection: nothing was posted, so release the claim and
      // try again after TikTok's cool-down.
      await prisma.tikTokReplyLog.delete({ where: { id: logId } });
      if (await requeue(data, THROTTLED_DELAY_MS)) return "requeued";
      await prisma.tikTokReplyLog.create({
        data: {
          ...logBase,
          campaignId: match.campaign.id,
          replyText,
          status: "FAILED",
          errorMessage: errorText(error),
        },
      });
      return "failed";
    }

    const confirmedRejection =
      error instanceof TikTokApiError && !error.isServerError;
    await prisma.tikTokReplyLog.update({
      where: { id: logId },
      data: {
        status: confirmedRejection ? "FAILED" : "UNCONFIRMED",
        errorMessage: confirmedRejection
          ? errorText(error)
          : `Outcome unknown, not retried: ${errorText(error)}`,
      },
    });

    if (
      error instanceof TikTokApiError &&
      (error.needsReauthorization || error.isTokenExpired)
    ) {
      await prisma.operationalEvent
        .create({
          data: {
            workspaceId: account.workspaceId,
            source: "WORKER",
            level: "WARNING",
            message: `TikTok @${account.username} needs to be reconnected: ${errorText(error)}`,
            payload: { tiktokAccountId: account.id, code: error.code },
          },
        })
        .catch(() => {});
    }
    return confirmedRejection ? "failed" : "unconfirmed";
  }
}

export function createTikTokWorker(): Worker<TikTokCommentJob> {
  const worker = new Worker<TikTokCommentJob>(
    TIKTOK_QUEUE_NAME,
    async (job: Job<TikTokCommentJob>) => processTikTokComment(job.data),
    { connection: getRedisConnection(), concurrency: 2 }
  );

  worker.on("failed", (job, error) => {
    console.error(`[TikTok Worker] Job ${job?.id} failed:`, error.message);
    void prisma.operationalEvent
      .create({
        data: {
          source: "WORKER",
          level: "ERROR",
          message: `TikTok job ${job?.id ?? "unknown"} failed: ${error.message}`,
          payload: {
            jobId: job?.id ?? null,
            tiktokAccountId: job?.data.tiktokAccountId ?? null,
            commentId: job?.data.commentId ?? null,
            transport: error instanceof TikTokTransportError,
          },
        },
      })
      .catch(() => {});
  });

  return worker;
}
