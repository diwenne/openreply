/**
 * Comment reconciliation (polling safety net).
 *
 * Instagram webhooks are best-effort and never fire for a large class of
 * comments (collapsed "load more" comments, non-follower / low-signal accounts,
 * anything Instagram filters). Those comments are otherwise invisible: never
 * replied to, never DM'd.
 *
 * This sweep is deliberately narrow. For each active campaign it looks only at
 * that campaign's post, only at recent comments, and acts on a comment ONLY when
 * both are true:
 *   1. the comment matches the campaign keyword, and
 *   2. the account owner has not already replied to it.
 * The reply check reads the comment's actual replies on Instagram, so a comment
 * you (or the tool) already answered is skipped — the poll never re-touches
 * handled comments. Each sweep is capped so it can never flood the comment API
 * (which Instagram rate-limits aggressively, error 368).
 *
 * It runs on an interval in the worker process because Vercel's free crons only
 * fire once a day. Matching and sending reuse the worker's processComment, so
 * rate limiting and logging behave exactly as for webhook-delivered comments.
 *
 * Known limitation, handled not fixed: comments removed by Instagram's Hidden
 * Words / spam filter may not be returned by the Graph API at all. Disable that
 * filter on the account to widen results.
 */

import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import {
  getRecentMediaComments,
  getUserMedia,
  MetaApiError,
  type InstagramComment,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

// Only consider comments from the last few days — older ones are outside
// Instagram's private-reply window anyway, so a DM to them would just fail.
const LOOKBACK_HOURS = Number(process.env.COMMENT_POLL_LOOKBACK_HOURS ?? 72);
// Hard cap on how many new comments a single campaign can enqueue per sweep, so
// a viral post drains gradually instead of bursting into the comment API.
const MAX_NEW_PER_SWEEP = Number(process.env.COMMENT_POLL_MAX_PER_SWEEP ?? 30);
// For "any post" campaigns, how many recent posts to scan.
const RECENT_MEDIA_LIMIT = 10;

interface SweepStat {
  campaign: string;
  keywords: string;
  matched: number;
  alreadyReplied: number;
  enqueued: number;
  errors: string[];
}

function errMessage(error: unknown): string {
  if (error instanceof MetaApiError) return `Meta ${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/** One reconciliation pass across every active campaign. */
export async function reconcileComments(): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      postId: true,
      matchAnyPost: true,
      matchAnyWord: true,
      keywords: true,
      wholeWordMatch: true,
      publicReplyEnabled: true,
      workspaceId: true,
      instagramAccount: {
        select: {
          id: true,
          instagramId: true,
          username: true,
          accessToken: true,
        },
      },
    },
  });

  const sinceMs = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;
  const tokenCache = new Map<string, string | null>();

  for (const automation of automations) {
    const stat = await sweepCampaign(automation, sinceMs, tokenCache).catch(
      (error): SweepStat => ({
        campaign: automation.name,
        keywords: automation.keywords.join(","),
        matched: 0,
        alreadyReplied: 0,
        enqueued: 0,
        errors: [errMessage(error)],
      })
    );
    await recordSweep(automation.workspaceId, stat);
  }
}

async function sweepCampaign(
  automation: {
    id: string;
    name: string;
    postId: string | null;
    matchAnyPost: boolean;
    matchAnyWord: boolean;
    keywords: string[];
    wholeWordMatch: boolean;
    publicReplyEnabled: boolean;
    instagramAccount: {
      id: string;
      instagramId: string;
      username: string;
      accessToken: string;
    };
  },
  sinceMs: number,
  tokenCache: Map<string, string | null>
): Promise<SweepStat> {
  const account = automation.instagramAccount;
  const stat: SweepStat = {
    campaign: automation.name,
    keywords: automation.matchAnyWord
      ? "(any word)"
      : automation.keywords.join(","),
    matched: 0,
    alreadyReplied: 0,
    enqueued: 0,
    errors: [],
  };

  // Decrypt the account token once per sweep.
  let accessToken = tokenCache.get(account.id);
  if (accessToken === undefined) {
    try {
      accessToken = decryptToken(account.accessToken);
    } catch {
      accessToken = null;
    }
    tokenCache.set(account.id, accessToken);
  }
  if (!accessToken) {
    stat.errors.push("Failed to decrypt access token");
    return stat;
  }

  // Which media this campaign covers: its own post, or the recent feed if it
  // matches any post.
  const mediaIds: string[] = [];
  if (automation.postId) {
    mediaIds.push(automation.postId);
    mediaIds.push(...(await adMediaFor(automation.postId)));
  } else if (automation.matchAnyPost) {
    try {
      const media = await getUserMedia(accessToken, RECENT_MEDIA_LIMIT);
      mediaIds.push(...media.map((m) => m.id));
    } catch (error) {
      stat.errors.push(`Media list: ${errMessage(error)}`);
    }
  }
  if (mediaIds.length === 0) return stat;

  const queue = getDMQueue();

  for (const mediaId of mediaIds) {
    let comments: InstagramComment[];
    try {
      comments = await getRecentMediaComments(accessToken, mediaId, sinceMs);
    } catch (error) {
      stat.errors.push(`Comments ${mediaId}: ${errMessage(error)}`);
      continue;
    }

    // Keep only comments that (a) aren't the account's own, (b) match the
    // keyword, and (c) have no reply from the account owner yet.
    const needsAction = comments.filter((c) => {
      const authorId = c.from?.id;
      if (!authorId || authorId === account.instagramId) return false;

      const matched = automation.matchAnyWord
        ? true
        : matchKeywords(c.text ?? "", automation.keywords, automation.wholeWordMatch)
            .matched;
      if (!matched) return false;
      stat.matched += 1;

      const ownerReplied = (c.replies?.data ?? []).some(
        (r) => r.from?.id === account.instagramId
      );
      if (ownerReplied) {
        stat.alreadyReplied += 1;
        return false;
      }
      return true;
    });
    if (needsAction.length === 0) continue;

    // Second guard against races: skip comments this campaign has already fully
    // handled. "Fully handled" depends on the campaign: if it posts a public
    // reply, the completion signal is publicReplySentAt (a DM alone is not
    // enough — the reply still has to land); otherwise a SENT DM is enough. This
    // is what lets a comment whose DM sent but whose public reply failed come
    // back and retry the reply.
    const handled = await prisma.dmLog.findMany({
      where: {
        automationId: automation.id,
        commentId: { in: needsAction.map((c) => c.id) },
        ...(automation.publicReplyEnabled
          ? { publicReplySentAt: { not: null } }
          : { status: "SENT" }),
      },
      select: { commentId: true },
    });
    const handledSet = new Set(handled.map((h) => h.commentId));

    // Oldest first, so whoever commented earliest gets answered first, capped.
    const fresh = needsAction
      .filter((c) => !handledSet.has(c.id))
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(0, MAX_NEW_PER_SWEEP);

    for (const c of fresh) {
      // No deterministic jobId here: a retained completed/failed job from an
      // earlier sweep would otherwise be treated as a duplicate and silently
      // drop this add, so the comment would never be retried. Dedup is handled
      // above (owner-reply + DmLog guards) and the worker is idempotent
      // (publicReplySentAt / SENT), so re-processing a comment is safe.
      await queue.add("process-comment", {
        instagramAccountId: account.instagramId,
        commentId: c.id,
        commentText: c.text ?? "",
        commenterId: c.from!.id,
        commenterName: c.from?.username,
        mediaId,
        // When the sweep is looking at an ad, the campaign is bound to the post
        // the ad was made from: without this the worker matches nothing and
        // drops the comment, so the sweep would enqueue it again every five
        // minutes and never deliver it.
        originalMediaId:
          automation.postId && mediaId !== automation.postId
            ? automation.postId
            : undefined,
        source: "POLLING",
      });
      stat.enqueued += 1;
    }
  }

  return stat;
}

/**
 * Ad copies of a post, as seen in webhooks already received.
 *
 * Boosting a post gives it a second media id: comments left on the ad arrive
 * with the ad's `media.id` and the post's id in `original_media_id`. The sweep
 * would otherwise only ever look at the post itself, so a comment Meta fails to
 * deliver on the ad is lost for good — exactly the case this safety net exists
 * for, and the one where volume is highest.
 *
 * The ad ids are recovered from the webhooks themselves rather than from the
 * ads API, which would need ads_management on top of the permissions the app
 * already asks for. The trade-off: an ad becomes visible to the sweep only once
 * a single comment on it has arrived. That is enough for the failure being
 * covered here, where some webhooks arrive and others do not.
 */
export async function adMediaFor(postId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ mediaId: string | null }[]>`
      SELECT DISTINCT change->'value'->'media'->>'id' AS "mediaId"
      FROM "WebhookEvent" w,
           jsonb_array_elements(w.payload::jsonb->'entry') entry,
           jsonb_array_elements(entry->'changes') change
      WHERE change->>'field' = 'comments'
        AND change->'value'->'media'->>'original_media_id' = ${postId}
        AND w."createdAt" > now() - interval '90 days'
    `;
    return rows
      .map((r) => r.mediaId)
      .filter((id): id is string => Boolean(id) && id !== postId);
  } catch {
    // A failure here must not stop the sweep: the post itself is still checked.
    return [];
  }
}

async function recordSweep(
  workspaceId: string,
  stat: SweepStat
): Promise<void> {
  // Only log when something happened or something went wrong.
  if (stat.enqueued === 0 && stat.errors.length === 0) return;

  await prisma.operationalEvent
    .create({
      data: {
        workspaceId,
        source: "SYSTEM",
        level: stat.errors.length > 0 ? "WARNING" : "INFO",
        message: `Comment sweep "${stat.campaign}" [${stat.keywords}]: ${stat.enqueued} enqueued, ${stat.matched} matched, ${stat.alreadyReplied} already replied`,
        payload: { ...stat },
      },
    })
    .catch(() => {});
}
