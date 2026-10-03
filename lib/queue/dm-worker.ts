import {
  classifySendError,
  hasLegacyUnconfirmedDelivery,
  isConfirmedSendRejection,
  isDeliveryUnconfirmed,
} from "@/lib/instagram/delivery-errors";
import { claimCommentDelivery, MAX_COMMENT_SEND_ATTEMPTS } from "./comment-delivery";
import { createHash } from "node:crypto";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import {
  getDMQueue,
  getRedisConnection,
  MESSAGE_JOB_NAME,
  POSTBACK_JOB_NAME,
  FOLLOWUP_JOB_NAME,
  type DmQueueJob,
  type ProcessCommentJob,
  type ProcessMessageJob,
  type ProcessPostbackJob,
  type ProcessFollowUpJob,
} from "./client";
import { prisma } from "@/lib/db/client";
import {
  MetaApiError,
  RateLimitError,
  TokenExpiredError,
  getUserFollowStatus,
  sendCommentReply,
  sendDirectMessage,
  sendDirectMessageWithButton,
  sendDirectMessageWithLinkButton,
  sendPrivateReply,
  sendPrivateReplyWithButton,
  sendPrivateReplyWithLinkButton,
} from "@/lib/instagram/provider";
import {
  createInstagramContext,
  hasInstagramCredentials,
  type InstagramContext,
} from "@/lib/instagram/provider";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import { reserveDMSlot, releaseDMSlot } from "@/lib/utils/rate-limiter";
import {
  releaseWorkspaceDMReservation,
  reserveWorkspaceDMSend,
} from "@/lib/billing/usage";
import { recordWorkerAlert } from "@/lib/ops/worker-health";
import {
  buildTrackedUrl,
  renderMessageWithTracking,
  renderMessageWithoutLink,
} from "@/lib/tracking/message";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { selectTriggerWinner } from "./trigger-selection";
import { scheduleFollowUp, deliverFollowUp } from "./follow-up-delivery";
import { recordDeliveryResult, deliveryOperationKey } from "./delivery-result";
import { campaignCanSend } from "@/lib/campaigns/selection";

import { ZernioApiError } from "@/lib/zernio/client";

const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

// How long to wait before re-checking a follow that came back false: one
// delay per re-check, each counted from the previous check.
//
// `is_user_follow_business` does not reflect a brand-new follow right away, and
// the follow gate asks people to follow and tap a button that is sitting in
// front of them — so tapping seconds after following is the normal case, not
// the exception. Rejecting on the first `false` therefore turns away the exact
// people who did what was asked, and they get told to follow an account they
// already follow.
//
// Two checks rather than one long wait: measured, a follow still read `false`
// 17 s after it happened and `true` by ~68 s. An early check catches the fast
// ones sooner; the last still covers the slow ones.
const FOLLOW_RECHECK_DELAYS_MS = (
  process.env.FOLLOW_RECHECK_DELAYS_MS ?? "20000,40000"
)
  .split(",")
  .map(Number)
  .filter((ms) => ms > 0);
const FOLLOW_RECHECK_TOTAL_MS = FOLLOW_RECHECK_DELAYS_MS.reduce(
  (total, ms) => total + ms,
  0
);

/**
 * Sends Meta answered with an error but may well have delivered anyway.
 *
 * Meta returns the generic code 1 OAuthException on /messages *after* the DM
 * has reached the recipient — observed in production: a user tapped the reply's
 * button 30 seconds after a send this worker had already marked FAILED. Logging
 * that as a plain failure is harmful twice over: the job is retried (up to
 * BACKOFF_DELAYS.length times, each retry another copy in the same inbox), and
 * the comment never satisfies the reconciler's "handled" test, so every sweep
 * re-enqueues it for the whole lookback window. Together that sent one person
 * dozens of identical DMs.
 *
 * Flagging it as unconfirmed instead is exactly what dmDeliveryUnconfirmed is
 * for: the sweep's dedup already treats that as handled, and processComment
 * skips a DM whose delivery is unconfirmed. The trade-off is deliberate — a
 * code 1 that really did fail means that person gets no DM and can comment
 * again, which is far better than spamming someone who already received it.
 */

function formatError(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `${error.name} ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

// Meta rejections that a plain-text retry cannot fix: the send was refused for
// the conversation, not for the button template. Retrying as text just burns
// the attempt and — worse — overwrites the real error with a misleading one
// ("invalid for a private reply", because the first attempt already used up the
// comment's single allowed private reply).
const NON_TEMPLATE_REJECTIONS = [
  /outside of allowed window/i,
  /invalid for a private reply/i,
  /requested user cannot be found/i,
];

function isTemplateRejection(error: unknown): boolean {
  if (
    error instanceof TokenExpiredError ||
    error instanceof RateLimitError ||
    error instanceof ZernioApiError
  ) {
    return false;
  }
  // Falling back is another send: allow it only for a proven template error.
  return error instanceof MetaApiError && error.code === 100 &&
    /template|button/i.test(error.message) &&
    !NON_TEMPLATE_REJECTIONS.some((pattern) => pattern.test(error.message));
}

type WorkerTrackedLink = {
  slug: string;
  label: string | null;
  destinationUrl: string;
};

/**
 * Build the tappable link buttons for a DM. The first link uses the campaign's
 * `linkButtonLabel`; each additional link uses its own stored `label`. Capped at
 * Meta's 3-button limit for a button template.
 */
function buildLinkButtons(
  trackedLinks: WorkerTrackedLink[],
  primaryLabel: string | null
): { title: string; url: string }[] {
  return trackedLinks.slice(0, 3).map((link, index) => ({
    url: buildTrackedUrl(link.slug),
    title:
      (index === 0 ? primaryLabel : link.label) || link.label || "Open link",
  }));
}

/**
 * Fallback text when Meta rejects the button template: render the primary link
 * inline, then append any extra tracked URLs on their own lines so no link is
 * lost.
 */
function buildInlineLinkFallback(
  message: string,
  commenterName: string | null | undefined,
  trackedLinks: WorkerTrackedLink[],
  bodyText: string
): string {
  const base =
    renderMessageWithTracking({ message, commenterName, trackedLinks }) ||
    bodyText;
  const extraUrls = trackedLinks
    .slice(1)
    .map((link) => buildTrackedUrl(link.slug));
  return extraUrls.length > 0 ? `${base}\n${extraUrls.join("\n")}` : base;
}

type RevealAutomation = {
  dmMessage: string;
  linkButtonLabel: string | null;
  trackedLinks: WorkerTrackedLink[];
  instagramAccount: { instagramId: string };
};

/**
 * Deliver a campaign's reveal message as a direct message. Shared by the
 * button-tap (postback) path and the DM keyword-trigger path — both already
 * have an open conversation with the user, so neither uses a private reply.
 */
async function sendRevealDirectMessage({
  accessToken,
  automation,
  userId,
  commenterName,
  context,
}: {
  accessToken: InstagramContext;
  automation: RevealAutomation;
  userId: string;
  commenterName: string | null;
  context: string;
}): Promise<void> {
  if (automation.trackedLinks.length === 0) {
    await sendDirectMessage({
      context: accessToken,
      instagramAccountId: automation.instagramAccount.instagramId,
      userId: userId,
      message: renderMessageWithTracking({
        message: automation.dmMessage,
        commenterName,
        trackedLinks: automation.trackedLinks,
      }),
    });
    return;
  }

  // Try button template first; if Meta rejects it, fall back to inline links.
  const bodyText =
    renderMessageWithoutLink({
      message: automation.dmMessage,
      commenterName,
    }) || "Here's your link:";
  const buttons = buildLinkButtons(
    automation.trackedLinks,
    automation.linkButtonLabel
  );

  try {
    await sendDirectMessageWithLinkButton({
      context: accessToken,
      instagramAccountId: automation.instagramAccount.instagramId,
      userId: userId,
      text: bodyText,
      buttons: buttons,
    });
  } catch (buttonError) {
    // A closed messaging window rejects the text retry too, so don't let it
    // overwrite the original error with a misleading one.
    if (!isTemplateRejection(buttonError)) throw buttonError;

    console.log(
      `[DM Worker] Button template rejected in ${context}, falling back to inline link:`,
      formatError(buttonError)
    );
    try {
      await sendDirectMessage({
        context: accessToken,
        instagramAccountId: automation.instagramAccount.instagramId,
        userId: userId,
        message: buildInlineLinkFallback(
          automation.dmMessage,
          commenterName,
          automation.trackedLinks,
          bodyText
        ),
      });
    } catch (fallbackError) {
      throw classifySendError(fallbackError);
    }
  }
}


function connectionScope(data: DmQueueJob) {
  return data.accountConnectionId ? { instagramAccountId: data.accountConnectionId } : {};
}

async function processComment(job: Job<ProcessCommentJob>): Promise<void> {
  const {
    instagramAccountId,
    commentId,
    commentText,
    commenterId,
    commenterName,
    mediaId,
    originalMediaId,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;

  const automations = await prisma.automation.findMany({
    where: {
      ...connectionScope(job.data),
      // Match campaigns bound to this specific post, plus any-post campaigns.
      // A comment left on an ad carries the ad's own media id, while the
      // campaign is bound to the post the ad was created from, so both ids
      // have to be considered or the comment is dropped without a trace.
      OR: [
        { postId: mediaId },
        ...(originalMediaId ? [{ postId: originalMediaId }] : []),
        { matchAnyPost: true },
      ],
      isActive: true,
      instagramAccount: {
        instagramId: instagramAccountId,
      },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: {
          slug: true,
          label: true,
          destinationUrl: true,
        },
        orderBy: TRACKED_LINK_ORDER,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const winner = await selectTriggerWinner(automations, {
    kind: "comment", text: commentText, mediaIds: [mediaId, ...(originalMediaId ? [originalMediaId] : [])],
    inputId: commentId, instagramId: instagramAccountId,
  });
  for (const automation of winner ? [winner] : []) {
    // "Any word" campaigns fire on every comment; otherwise require a keyword hit.
    const matchResult = automation.matchAnyWord
      ? { matched: true, matchedKeyword: null }
      : matchKeywords(
          commentText,
          automation.keywords,
          automation.wholeWordMatch
        );

    if (!matchResult.matched) {
      continue;
    }

    const existingLog = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId,
        },
      },
    });

    if (existingLog?.status === "FAILED" && hasLegacyUnconfirmedDelivery(existingLog.errorMessage)) {
      await prisma.dmLog.update({
        where: { automationId_commentId: { automationId: automation.id, commentId } },
        data: { dmDeliveryUnconfirmed: true },
      });
      existingLog.dmDeliveryUnconfirmed = true;
    }

    const alreadyDmd = existingLog?.status === "SENT";
    const alreadyPublicReplied = Boolean(existingLog?.publicReplySentAt);
    const needsDm = !alreadyDmd && !existingLog?.dmDeliveryUnconfirmed &&
      (existingLog?.attempts ?? 0) < MAX_COMMENT_SEND_ATTEMPTS;

    // Skip only when there is genuinely nothing left to do. A comment whose DM
    // already sent but whose public reply never posted (e.g. it hit a rate
    // limit) must still come back so the public reply can be retried.
    if (existingLog?.status === "SKIPPED_PLAN_LIMIT") continue;
    if (
      !needsDm &&
      (alreadyPublicReplied || existingLog?.publicReplyDeliveryUnconfirmed || !automation.publicReplyEnabled)
    ) {
      continue;
    }

    if (!hasInstagramCredentials(automation.instagramAccount)) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
        update: {
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
      });
      continue;
    }

    let accessToken: InstagramContext;
    try {
      accessToken = await createInstagramContext(
        automation.instagramAccount,
        `${job.id}:${automation.id}`
      );
    } catch {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
        update: {
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
      });
      continue;
    }

    await prisma.dmLog.upsert({
      where: { automationId_commentId: { automationId: automation.id, commentId } },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId, commenterName, commentText, commentId,
        matchedKeyword: matchResult.matchedKeyword,
        status: "PENDING",
      },
      update: {},
    });

    // Public reply leg — decoupled from the DM and posted first so a DM failure
    // (e.g. a non-follower whose messaging is restricted) never suppresses it.
    // Idempotent across retries via publicReplySentAt.
    const replyPool =
      automation.publicReplyMessages.length > 0
        ? automation.publicReplyMessages
        : automation.publicReplyMessage
          ? [automation.publicReplyMessage]
          : [];
    const publicReply = renderMessageWithTracking({
      message: replyPool[Math.floor(Math.random() * replyPool.length)] ?? "",
      commenterName, trackedLinks: automation.trackedLinks,
    });
    if (
      automation.publicReplyEnabled &&
      replyPool.length > 0 &&
      !existingLog?.publicReplySentAt &&
      !existingLog?.publicReplyDeliveryUnconfirmed &&
      await claimCommentDelivery(automation.id, commentId, "public", {
        workspaceId: automation.workspaceId, instagramAccountId: automation.instagramAccountId,
        version: automation.version, stage: "PUBLIC_REPLY", recipientId: commenterId, message: publicReply,
      })
    ) {
      try {
        await sendCommentReply({
          context: accessToken,
          commentId: commentId,
          message: publicReply,
          postId: mediaId,
        });
        await recordDeliveryResult(automation, {
          sourceId: commentId, stage: "PUBLIC_REPLY", status: "SENT",
          recipientId: commenterId, message: publicReply,
        }, (tx) => tx.dmLog.update({
          where: {
            automationId_commentId: { automationId: automation.id, commentId },
          },
          data: { publicReplySentAt: new Date(), publicReplyError: null, publicReplyDeliveryUnconfirmed: false },
        }));
      } catch (error) {
        console.error(
          "[DM Worker] Public comment reply failed:",
          formatError(error)
        );
        await recordDeliveryResult(automation, {
          sourceId: commentId, stage: "PUBLIC_REPLY",
          status: isConfirmedSendRejection(error) ? "FAILED" : "UNCONFIRMED",
          recipientId: commenterId, error: formatError(classifySendError(error)),
        }, (tx) => tx.dmLog.update({
            where: {
              automationId_commentId: {
                automationId: automation.id,
                commentId,
              },
            },
            data: { publicReplyError: formatError(classifySendError(error)), publicReplyDeliveryUnconfirmed: !isConfirmedSendRejection(error) },
          }))
          .catch(() => {});
      }
    }

    // DM already sent on an earlier pass; the public reply retry above was all
    // this run needed. Don't re-send the DM.
    if (!needsDm) continue;

    // Meta allows exactly ONE private reply per comment, ever — across every
    // campaign. When several campaigns match the same comment (duplicated
    // campaigns, or an any-post campaign overlapping a post-specific one), only
    // the first can deliver; the rest would fail with "The comment is invalid
    // for a private reply". Skip them explicitly instead of burning an API call
    // and logging a failure the user can do nothing about. The public reply
    // winner reservation above also pins public replies to the same campaign.
    const privateReplyUsedBy = await prisma.dmLog.findFirst({
      where: {
        commentId,
        instagramAccountId: automation.instagramAccountId,
        OR: [{ status: "SENT" }, { dmDeliveryUnconfirmed: true }],
        automationId: { not: automation.id },
      },
      select: { automation: { select: { name: true } } },
    });
    if (privateReplyUsedBy) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: { automationId: automation.id, commentId },
        },
        data: {
          status: "SKIPPED_DEDUP",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Another campaign (${privateReplyUsedBy.automation?.name ?? "unknown"}) already sent the one private reply Instagram allows for this comment`,
        },
      });
      continue;
    }

    const usage = await reserveWorkspaceDMSend(automation.workspaceId);
    if (!usage.allowed) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SKIPPED_PLAN_LIMIT",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
      });
      continue;
    }

    let rateLimit;
    try {
      rateLimit = await reserveDMSlot(instagramAccountId, requeueAttempt);
    } catch (error) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "FAILED",
          errorMessage: formatError(error),
        },
      });
      throw error;
    }

    if (!rateLimit.allowed) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );

      if (rateLimit.shouldSkip) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "SKIPPED_RATE_LIMIT",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly Instagram DM rate limit reached",
          },
        });
        continue;
      }

      if (rateLimit.shouldRequeue) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "PENDING",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly rate limit hit; retry scheduled",
          },
        });

        await getDMQueue().add(
          "process-comment",
          {
            ...job.data,
            requeueAttempt: requeueAttempt + 1,
          },
          {
            delay: rateLimit.requeueDelayMs,
            jobId: `comment_${instagramAccountId}_${commentId}_retry_${requeueAttempt + 1}`,
          }
        );
        continue;
      }
    }

    // With an opening DM, the private reply is a button message; tapping it
    // fires a postback that delivers the reveal (see processPostback). Without
    // one, we send the reveal text directly as today.
    const useOpeningDm =
      automation.openingDmEnabled &&
      Boolean(automation.openingDmMessage) &&
      Boolean(automation.openingDmButtonLabel);

    // Follow-gating: the link is revealed only after a follow. When an opening
    // DM is enabled it comes FIRST, and its button routes into the follow check
    // (opening DM → follow gate → link). Without an opening DM, we check follow
    // status at comment time: confirmed followers get the link now, everyone
    // else gets the "follow me first" prompt (re-verified on tap).
    let sendFollowPrompt = false;
    if (automation.requireFollow && !useOpeningDm) {
      const alreadyFollows = await getUserFollowStatus({
        context: accessToken,
        recipientId: commenterId,
      });
      sendFollowPrompt =
        accessToken.provider === "ZERNIO"
          ? alreadyFollows === false
          : alreadyFollows !== true;
    }

    let claimed;
    try {
      claimed = await claimCommentDelivery(automation.id, commentId, "dm", {
        workspaceId: automation.workspaceId, instagramAccountId: automation.instagramAccountId,
        version: automation.version, stage: useOpeningDm ? "OPENING_DM" : sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        recipientId: commenterId, message: useOpeningDm ? automation.openingDmMessage : sendFollowPrompt ? automation.followPromptMessage : automation.dmMessage,
      });
    } catch (error) {
      if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      throw error;
    }
    if (!claimed) {
      if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      continue;
    }
    let delivered = false;
    try {
      if (useOpeningDm) {
        const openingText = renderMessageWithTracking({
          message: automation.openingDmMessage as string,
          commenterName,
          trackedLinks: [],
        });
        await sendPrivateReplyWithButton({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          text: openingText,
          buttonTitle: automation.openingDmButtonLabel as string,
          // The ":open" marker tells a tap here apart from the follow prompt's
          // own "I'm following" button, which sends the same prefix.
          payload: `${automation.requireFollow ? "followcheck" : "reveal"}:${automation.id}:open`,
          postId: mediaId,
        });
      } else if (sendFollowPrompt) {
        const promptText = renderMessageWithoutLink({
          message:
            automation.followPromptMessage ||
            "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over",
          commenterName,
        });
        await sendPrivateReplyWithButton({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          text: promptText,
          buttonTitle: automation.followPromptButtonLabel || "i'm following",
          payload: `followcheck:${automation.id}`,
          postId: mediaId,
        });
      } else if (automation.trackedLinks.length > 0) {
        // Try button template first; if Meta rejects it, fall back to inline links.
        const bodyText =
          renderMessageWithoutLink({
            message: automation.dmMessage,
            commenterName,
          }) || "Here's your link:";
        const buttons = buildLinkButtons(
          automation.trackedLinks,
          automation.linkButtonLabel
        );

        try {
          await sendPrivateReplyWithLinkButton({
            context: accessToken,
            instagramAccountId: automation.instagramAccount.instagramId,
            commentId: commentId,
            text: bodyText,
            buttons: buttons,
            postId: mediaId,
          });
        } catch (buttonError) {
          // Only a template rejection is worth retrying as text. Anything else
          // (closed window, comment already replied to) fails the same way and
          // would replace the real error with a misleading one.
          if (!isTemplateRejection(buttonError)) throw buttonError;

          console.log(
            "[DM Worker] Button template rejected, falling back to inline link:",
            formatError(buttonError)
          );
          const fallbackMessage = buildInlineLinkFallback(
            automation.dmMessage,
            commenterName,
            automation.trackedLinks,
            bodyText
          );
          try {
            await sendPrivateReply({
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              commentId: commentId,
              message: fallbackMessage,
              postId: mediaId,
            });
          } catch (fallbackError) {
            throw classifySendError(fallbackError);
          }
        }
      } else {
        const dmMessage = renderMessageWithTracking({
          message: automation.dmMessage,
          commenterName,
          trackedLinks: automation.trackedLinks,
        });
        await sendPrivateReply({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          message: dmMessage,
          postId: mediaId,
        });
      }

      delivered = true;
      await recordDeliveryResult(automation, {
        sourceId: commentId, stage: useOpeningDm ? "OPENING_DM" : sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        status: "SENT", recipientId: commenterId,
        message: useOpeningDm ? automation.openingDmMessage : sendFollowPrompt ? automation.followPromptMessage : automation.dmMessage,
      }, (tx) => tx.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SENT",
          dmSentAt: new Date(),
          dmDeliveryUnconfirmed: false,
          errorMessage: null,
        },
      }));
    } catch (error) {
      const sendError = classifySendError(error);
      // Retain reservations if the provider may have delivered the message.
      if (isConfirmedSendRejection(sendError)) {
        if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
        await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      }
      await recordDeliveryResult(automation, {
        sourceId: commentId, stage: useOpeningDm ? "OPENING_DM" : sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        status: delivered ? "SENT" : isDeliveryUnconfirmed(sendError) ? "UNCONFIRMED" : "FAILED",
        recipientId: commenterId, error: formatError(sendError),
      }, (tx) => tx.dmLog.update({
        where: { automationId_commentId: { automationId: automation.id, commentId } },
        data: {
          status: delivered ? "SENT" : "FAILED",
          ...(delivered ? { dmSentAt: new Date() } : {}),
          errorMessage: formatError(sendError),
          dmDeliveryUnconfirmed: isDeliveryUnconfirmed(sendError),
        },
      }));
      throw sendError;
    }
  }
}

async function sendPostbackOnce({
  operationId,
  send,
  delivery,
}: {
  operationId: string;
  send: () => Promise<unknown>;
  delivery: {
    automation: { id: string; workspaceId: string; instagramAccountId: string; version: number };
    sourceId: string; stage: string; recipientId: string; message: string;
  };
}): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.postbackDelivery.create({ data: { id: operationId } });
      const { automation, sourceId, stage, recipientId, message } = delivery;
      const operationKey = deliveryOperationKey(automation.id, sourceId, stage);
      await tx.deliveryEvent.upsert({ where: { operationKey },
        create: { operationKey, stage, status: "CLAIMED", claimedAt: new Date(),
          workspaceId: automation.workspaceId, automationId: automation.id,
          instagramAccountId: automation.instagramAccountId, campaignVersion: automation.version,
          recipientId, message, attempts: 1 },
        // A confirmed rejection permits a fresh attempt with today's content.
        // Keep its version and message consistent; successful/uncertain claims
        // remain protected by PostbackDelivery and cannot reach this update.
        update: { status: "CLAIMED", claimedAt: new Date(), attempts: { increment: 1 },
          campaignVersion: automation.version, recipientId, message },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      return false;
    throw error;
  }
  try {
    await send();
    return true;
  } catch (error) {
    // A durable claim survives queue eviction, concurrent redelivery, and a
    // process crash during delivery. Only confirmed rejections permit retry.
    if (isConfirmedSendRejection(error)) {
      await prisma.postbackDelivery.delete({ where: { id: operationId } });
      throw error;
    }
    throw classifySendError(error);
  }
}

// Tells someone whose "I'm following" tap is being re-checked that it is being
// looked at, so the chat does not sit silent while Instagram catches up with
// the follow. Opt-in through FOLLOW_RECHECK_ACK_MESSAGE, and best-effort: it
// never holds up the re-check, which is already queued when this runs.
async function sendFollowRecheckAck({
  context,
  instagramAccountId,
  automationId,
  userId,
  operationId,
  automation,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  automationId: string;
  userId: string;
  operationId: string;
  automation: { id: string; workspaceId: string; instagramAccountId: string; version: number };
}): Promise<void> {
  const message = process.env.FOLLOW_RECHECK_ACK_MESSAGE?.trim();
  if (!message) return;
  try {
    // One acknowledgement per re-check cycle: a burst of taps collapses into a
    // single re-check (bucketed job id) and should get a single reply too.
    const first = await getRedisConnection().set(
      `follow_recheck_ack:${automationId}:${userId}`,
      "1",
      "PX",
      FOLLOW_RECHECK_TOTAL_MS,
      "NX"
    );
    if (first !== "OK") return;
    const delivered = await sendPostbackOnce({
      // Its own id: the tap's id is claimed later by the link or prompt that
      // the re-check sends, and claiming it here would suppress that message.
      operationId: `${operationId}:ack`,
      delivery: { automation, sourceId: operationId, stage: "FOLLOW_ACK", recipientId: userId, message },
      send: () =>
        sendDirectMessage({ context, instagramAccountId, userId, message }),
    });
    if (delivered) await recordDeliveryResult(automation, {
      sourceId: operationId, stage: "FOLLOW_ACK", status: "SENT", recipientId: userId, message,
    }, async () => undefined);
  } catch (error) {
    await recordDeliveryResult(automation, {
      sourceId: operationId, stage: "FOLLOW_ACK", recipientId: userId, message,
      status: isConfirmedSendRejection(error) ? "FAILED" : "UNCONFIRMED", error: formatError(error),
    }, async () => undefined).catch(() => {});
    console.log(
      "[DM Worker] Failed to send follow re-check acknowledgement:",
      formatError(error),
    );
  }
}

/**
 * Deliver the reveal message after a user taps an opening DM's button.
 * The postback payload is `reveal:<automationId>`; the sender is the user's
 * IGSID (same id as their comment author id), which we DM directly.
 */
async function processPostback(job: Job<ProcessPostbackJob>): Promise<void> {
  const { instagramAccountId, userId, payload, fallback } = job.data;

  const isFollowCheck = payload.startsWith("followcheck:");
  if (!isFollowCheck && !payload.startsWith("reveal:")) return;
  // The opening DM's button appends ":open" to the payload; the follow
  // prompt's button does not. Automation ids are cuids and contain no colon.
  const [automationId, marker] = payload
    .slice(isFollowCheck ? "followcheck:".length : "reveal:".length)
    .split(":");
  const fromOpeningDm = marker === "open";

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true, ...connectionScope(job.data) },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: TRACKED_LINK_ORDER,
      },
    },
  });

  if (
    !automation ||
    !campaignCanSend(automation) ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !hasInstagramCredentials(automation.instagramAccount)
  ) {
    return;
  }

  // Duplicate sends are enabled: every button tap re-sends the reveal
  // instead of only firing once per person.
  const dedupeId = `reveal:${userId}`;

  if (fallback) {
    const existingReveal = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
    });
    if (
      existingReveal?.status === "SENT" ||
      existingReveal?.dmDeliveryUnconfirmed ||
      hasLegacyUnconfirmedDelivery(existingReveal?.errorMessage)
    )
      return;
  }

  // Personalize {username} from the opening DM log for this user, if present.
  const openingLog = await prisma.dmLog.findFirst({
    where: { automationId: automation.id, commenterId: userId },
    select: { commenterName: true },
  });
  const commenterName = openingLog?.commenterName ?? null;

  let accessToken: InstagramContext;
  try {
    accessToken = await createInstagramContext(
      automation.instagramAccount,
      `${job.id}:${automation.id}`,
    );
  } catch {
    return;
  }

  const operationId = createHash("sha256")
    .update(JSON.stringify([
      automation.instagramAccountId,
      automation.id,
      userId,
      job.data.mid ?? job.id ?? payload,
    ]))
    .digest("hex");

  // Follow-gate: before revealing the link, verify the user follows. On a
  // `followcheck:` tap a non-follower gets the prompt again (no quota spent);
  // on a read fallback a non-follower is silently skipped — the gate must not
  // be bypassable by just reading the DM and waiting. On a tap, following or
  // unverifiable (null) falls through and delivers the link — fail-open so a
  // real follower is never trapped.
  if ((isFollowCheck || fallback) && automation.requireFollow) {
    const follows = await getUserFollowStatus({
      context: accessToken,
      recipientId: userId,
    });
    // A read fallback needs a confirmed follow. Instagram only reports follow
    // status once the person has tapped a button (before that it answers
    // "User consent is required", i.e. null), so failing open here handed the
    // link to anyone who read the opening DM and waited, follower or not.
    if (fallback && follows !== true) return;
    if (follows === false) {
      if (fallback) return;

      // A tap on an opening-DM button is not a claim to follow — most people
      // who tap it simply don't follow yet — so they get the follow prompt
      // right away. Only the prompt's own button earns the delayed re-check;
      // holding an opening tap for it left people staring at a silent chat.
      if (!fromOpeningDm) {
        // A `false` on a button tap: give the follow time to register and look
        // again, rather than rejecting someone who just followed.
        //
        // The job id is bucketed by the recheck window, not fixed per user.
        // BullMQ keeps completed jobs (removeOnComplete: count 1000) and silently
        // drops an add whose id is still retained, so a fixed id let a person be
        // re-checked once and then never again — their next false tap did
        // nothing at all, no link and no prompt. Bucketing still collapses a burst
        // of taps into a single re-check, which is what the fixed id was for.
        //
        // Jobs queued before re-checks were counted carry only `followRecheck`,
        // which meant one re-check done.
        const rechecksDone =
          job.data.followRecheckAttempt ?? (job.data.followRecheck ? 1 : 0);
        if (rechecksDone < FOLLOW_RECHECK_DELAYS_MS.length) {
          const delay = FOLLOW_RECHECK_DELAYS_MS[rechecksDone];
          const window = Math.floor(Date.now() / delay);
          await getDMQueue().add(
            POSTBACK_JOB_NAME,
            {
              ...job.data,
              followRecheck: true,
              followRecheckAttempt: rechecksDone + 1,
            },
            {
              delay,
              jobId: `postback_recheck_${automation.id}_${userId}_${rechecksDone + 1}_${window}`,
            }
          );
          if (rechecksDone === 0) {
            await sendFollowRecheckAck({
              automation,
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              automationId: automation.id,
              userId,
              operationId,
            });
          }
          return;
        }

        // Last `false`: they are genuinely not following. Record it — this
        // branch used to return without writing anything at all, so a gate that
        // turned people away left no trace and its rejection rate could not be
        // measured, only guessed at from complaints.
        await prisma.operationalEvent
          .create({
            data: {
              workspaceId: automation.workspaceId,
              source: "WORKER",
              level: "INFO",
              message: "Follow gate rejected a button tap",
              payload: {
                automationId: automation.id,
                automationName: automation.name,
                userId,
                commenterName,
              },
            },
          })
          .catch(() => {});
      }

      const promptText = renderMessageWithoutLink({
        message:
          automation.followPromptMessage ||
          "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over",
        commenterName,
      });
      try {
        const delivered = await sendPostbackOnce({
          operationId,
          delivery: { automation, sourceId: operationId, stage: "FOLLOW_PROMPT", recipientId: userId, message: promptText },
          send: () =>
            sendDirectMessageWithButton({
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              userId: userId,
              text: promptText,
              buttonTitle:
                automation.followPromptButtonLabel || "i'm following",
              payload: `followcheck:${automation.id}`,
            }),
        });
        if (delivered) await recordDeliveryResult(automation, {
          sourceId: operationId, stage: "FOLLOW_PROMPT", status: "SENT", recipientId: userId, message: promptText,
        }, async () => undefined);
      } catch (error) {
        await recordDeliveryResult(automation, {
          sourceId: operationId, stage: "FOLLOW_PROMPT", recipientId: userId, message: promptText,
          status: isConfirmedSendRejection(error) ? "FAILED" : "UNCONFIRMED", error: formatError(error),
        }, async () => undefined).catch(() => {});
        console.log(
          "[DM Worker] Failed to re-send follow prompt:",
          formatError(error),
        );
      }
      return;
    }
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
      update: { status: "SKIPPED_PLAN_LIMIT" },
    });
    return;
  }

  try {
    const delivered = await sendPostbackOnce({
      operationId,
      delivery: { automation, sourceId: operationId, stage: "REVEAL", recipientId: userId, message: automation.dmMessage },
      send: () =>
        sendRevealDirectMessage({
          accessToken: accessToken,
          automation: automation,
          userId: userId,
          commenterName: commenterName,
          context: "postback",
        }),
    });
    if (!delivered) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart,
      );
      return;
    }
    // Optional appreciation follow-up: once the link has been delivered, send a
    // short thank-you. It is scheduled as its own delayed job so it can go out
    // some minutes later (followUpDelayMinutes) rather than immediately. The
    // deterministic job id dedupes repeat button taps to one follow-up per user.
    await recordDeliveryResult(automation, {
      sourceId: operationId, stage: "REVEAL", status: "SENT",
      recipientId: userId, message: automation.dmMessage,
    }, async (tx) => {
    await tx.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SENT",
        dmSentAt: new Date(),
      },
      update: { status: "SENT", dmSentAt: new Date(), errorMessage: null },
    });
    // Only actual user interactions open the follow-up window.
    if (!fallback) await scheduleFollowUp(automation, {
      userId, commenterName, sourceId: operationId,
      interactionAt: job.data.interactionAt ? new Date(job.data.interactionAt) : null,
    }, tx);
    });
  } catch (originalError) {
    const error = classifySendError(originalError);
    if (isConfirmedSendRejection(error)) await releaseWorkspaceDMReservation(
      automation.workspaceId,
      usage.periodStart,
    );

    // The read fallback is speculative: it only runs when the user read the
    // opening DM and never tapped the button, which means they never messaged
    // us, which means the 24-hour window is closed and Meta rejects the send
    // ("outside of allowed window"). That is the expected outcome here, not a
    // failure the user can act on — so don't log it as FAILED and don't retry
    // it against a window that cannot reopen on its own. It still delivers in
    // the case that does work: the user replied by typing instead of tapping.
    if (fallback && !isDeliveryUnconfirmed(error)) {
      console.log(
        "[DM Worker] Read fallback not delivered (messaging window closed):",
        formatError(error),
      );
      return;
    }

    await recordDeliveryResult(automation, {
      sourceId: operationId, stage: "REVEAL", recipientId: userId,
      status: isDeliveryUnconfirmed(error) ? "UNCONFIRMED" : "FAILED", error: formatError(error),
    }, (tx) => tx.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "FAILED",
        errorMessage: formatError(error),
        dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
      },
      update: {
        status: "FAILED",
        errorMessage: formatError(error),
        dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
      },
    }));
    throw error;
  }
}

/**
 * Send the scheduled appreciation follow-up. Runs after its delay elapses.
 * Best-effort: if the message can't be delivered (e.g. the 24-hour messaging
 * window closed because the delay was long), it is logged, not retried forever.
 */
async function processFollowUp(job: Job<ProcessFollowUpJob>): Promise<void> {
  await deliverFollowUp(job.data, String(job.id));
}

/**
 * Reply to an inbound DM whose text matches a campaign's keywords.
 *
 * The user has messaged us, so the conversation is already open: this path
 * skips the opening DM (which exists to work around private-reply limits from
 * comments) and delivers the reveal directly, honouring the follow gate.
 * Dedup is per inbound message id, so each message triggers at most one reply.
 */
async function processMessage(job: Job<ProcessMessageJob>): Promise<void> {
  const { instagramAccountId, messageId, messageText, senderId } = job.data;

  const automations = await prisma.automation.findMany({
    where: {
      ...connectionScope(job.data),
      dmTriggerEnabled: true,
      isActive: true,
      instagramAccount: { instagramId: instagramAccountId },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: TRACKED_LINK_ORDER,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const dedupeId = `dm:${messageId}`;

  const winner = await selectTriggerWinner(automations, {
    kind: "dm", text: messageText, inputId: dedupeId, instagramId: instagramAccountId,
  });
  for (const automation of winner ? [winner] : []) {
    const matchResult = automation.matchAnyWord
      ? { matched: true, matchedKeyword: null }
      : matchKeywords(
          messageText,
          automation.keywords,
          automation.wholeWordMatch
        );

    if (!matchResult.matched) continue;

    const existingLog = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
    });

    // Already replied to this message (or deliberately skipped it) — a retry
    // of the job must not send a second DM.
    if (
      existingLog?.status === "SENT" ||
      existingLog?.status === "SKIPPED_PLAN_LIMIT" ||
      existingLog?.dmDeliveryUnconfirmed ||
      hasLegacyUnconfirmedDelivery(existingLog?.errorMessage)
    ) {
      continue;
    }

    const logBase = {
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: automation.instagramAccountId,
      commenterId: senderId,
      commentText: messageText,
      commentId: dedupeId,
      matchedKeyword: matchResult.matchedKeyword,
    };

    if (!hasInstagramCredentials(automation.instagramAccount)) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
        update: {
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
      });
      continue;
    }

    let accessToken: InstagramContext;
    try {
      accessToken = await createInstagramContext(
        automation.instagramAccount,
        `${job.id}:${automation.id}`
      );
    } catch {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
        update: {
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
      });
      continue;
    }

    // Reuse a name captured on an earlier interaction so {username} still
    // renders — the messages webhook carries only the sender's IGSID.
    const priorLog = await prisma.dmLog.findFirst({
      where: { automationId: automation.id, commenterId: senderId },
      select: { commenterName: true },
    });
    const commenterName = priorLog?.commenterName ?? null;

    // Follow gate: anyone not confirmed as a follower gets the prompt instead of
    // the link, with the same `followcheck:` button that re-verifies on tap.
    // `null` (unverifiable) prompts too — this is first contact, exactly like a
    // comment, so it follows processComment's fail-closed rule rather than the
    // postback path's fail-open one. Fail-open is only safe after a tap, where
    // the user has already claimed to follow; here it would hand the link to
    // anyone whose status the API happens not to resolve.
    let sendFollowPrompt = false;
    if (automation.requireFollow) {
      const follows = await getUserFollowStatus({
        context: accessToken,
        recipientId: senderId,
      });
      sendFollowPrompt =
        accessToken.provider === "ZERNIO"
          ? follows === false
          : follows !== true;
    }

    const usage = await reserveWorkspaceDMSend(automation.workspaceId);
    if (!usage.allowed) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "SKIPPED_PLAN_LIMIT",
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
        update: {
          status: "SKIPPED_PLAN_LIMIT",
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
      });
      continue;
    }

    let claimed;
    try {
      await prisma.dmLog.upsert({
        where: { automationId_commentId: { automationId: automation.id, commentId: dedupeId } },
        create: { ...logBase, commenterName, status: "PENDING" },
        // Non-empty no-content-change update avoids an emulated read/create
        // upsert race when parallel jobs see the same inbound message.
        update: { commentId: dedupeId },
      });
      claimed = await claimCommentDelivery(automation.id, dedupeId, "dm", {
        workspaceId: automation.workspaceId, instagramAccountId: automation.instagramAccountId,
        version: automation.version, stage: sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        recipientId: senderId, message: sendFollowPrompt ? automation.followPromptMessage : automation.dmMessage,
      });
    } catch (error) {
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      throw error;
    }
    if (!claimed) {
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      continue;
    }
    try {
      if (sendFollowPrompt) {
        const promptText = renderMessageWithoutLink({
          message:
            automation.followPromptMessage ||
            "Almost there! Follow me and tap the button below to grab your link 💛",
          commenterName,
        });
        await sendDirectMessageWithButton({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          userId: senderId,
          text: promptText,
          buttonTitle: automation.followPromptButtonLabel || "I'm following ✅",
          payload: `followcheck:${automation.id}`,
        });
      } else {
        await sendRevealDirectMessage({
          accessToken: accessToken,
          automation: automation,
          userId: senderId,
          commenterName: commenterName,
          context: "message trigger",
        });

        // The link has been delivered, so the appreciation follow-up applies
        // here exactly as it does after a button tap. Not scheduled behind the
        // follow prompt — no link went out yet in that branch.
      }

      await recordDeliveryResult(automation, {
        sourceId: dedupeId, stage: sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        status: "SENT", recipientId: senderId,
        message: sendFollowPrompt ? automation.followPromptMessage : automation.dmMessage,
      }, async (tx) => {
      await tx.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          commenterName,
          status: "SENT",
          dmSentAt: new Date(),
          dmDeliveryUnconfirmed: false,
        },
        update: {
          status: "SENT",
          dmSentAt: new Date(),
          errorMessage: null,
          dmDeliveryUnconfirmed: false,
        },
      });
      if (!sendFollowPrompt) await scheduleFollowUp(automation, {
        userId: senderId, commenterName, sourceId: dedupeId,
        interactionAt: job.data.interactionAt ? new Date(job.data.interactionAt) : null,
      }, tx);
      });
    } catch (originalError) {
      const error = classifySendError(originalError);
      if (isConfirmedSendRejection(error)) await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await recordDeliveryResult(automation, {
        sourceId: dedupeId, stage: sendFollowPrompt ? "FOLLOW_PROMPT" : "REVEAL",
        recipientId: senderId, status: isDeliveryUnconfirmed(error) ? "UNCONFIRMED" : "FAILED",
        error: formatError(error),
      }, (tx) => tx.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          commenterName,
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
          dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
        },
        update: {
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
          dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
        },
      }));
      throw error;
    }
  }
}

async function dispatchJob(job: Job<DmQueueJob>): Promise<void> {
  if (job.name === POSTBACK_JOB_NAME) {
    return processPostback(job as Job<ProcessPostbackJob>);
  }
  if (job.name === FOLLOWUP_JOB_NAME) {
    return processFollowUp(job as Job<ProcessFollowUpJob>);
  }
  if (job.name === MESSAGE_JOB_NAME) {
    return processMessage(job as Job<ProcessMessageJob>);
  }
  return processComment(job as Job<ProcessCommentJob>);
}

async function processJob(job: Job<DmQueueJob>): Promise<void> {
  try {
    await dispatchJob(job);
  } catch (error) {
    // formatError() takes unknown; isDeliveryUnconfirmed() is a type guard on
    // Error subclasses, but keep using formatError() for a consistent message
    // format across every UnrecoverableError thrown from this worker.
    if (isDeliveryUnconfirmed(error))
      throw new UnrecoverableError(formatError(error));
    throw error;
  }
}

async function recordWorkerFailure(
  job: Job<DmQueueJob> | undefined,
  error: Error
) {
  try {
    const instagramAccountId = job?.data.instagramAccountId;
    const commentId =
      job && "commentId" in job.data ? job.data.commentId : null;
    const account = instagramAccountId
      ? await prisma.instagramAccount.findUnique({
          where: { instagramId: instagramAccountId },
          select: { workspaceId: true },
        })
      : null;

    await prisma.operationalEvent.create({
      data: {
        workspaceId: account?.workspaceId ?? null,
        source: "WORKER",
        level: "ERROR",
        message: `DM worker job ${job?.id ?? "unknown"} failed: ${error.message}`,
        payload: {
          jobId: job?.id ?? null,
          attemptsMade: job?.attemptsMade ?? null,
          instagramAccountId: instagramAccountId ?? null,
          commentId,
        },
      },
    });

    await recordWorkerAlert({
      level: "error",
      message: error.message,
      jobId: job?.id,
      instagramAccountId,
      commentId: commentId ?? undefined,
    });
  } catch (recordError) {
    console.error(
      "[DM Worker] Failed to record worker failure:",
      formatError(recordError)
    );
  }
}

export function createDMWorker(): Worker<DmQueueJob> {
  const worker = new Worker<DmQueueJob>("dm-processing", processJob, {
    connection: getRedisConnection(),
    concurrency: 5,
    settings: {
      backoffStrategy: (attemptsMade: number) =>
        BACKOFF_DELAYS[Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1)],
    },
  });

  worker.on("completed", (job) => {
    console.log(`[DM Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[DM Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message
    );
    void recordWorkerFailure(job, err);
  });

  worker.on("error", (err) => {
    console.error("[DM Worker] Worker error:", err.message);
    void prisma.operationalEvent
      .create({
        data: {
          source: "WORKER",
          level: "ERROR",
          message: `DM worker process error: ${err.message}`,
          payload: { name: err.name },
        },
      })
      .catch((recordError) => {
        console.error(
          "[DM Worker] Failed to record worker process error:",
          formatError(recordError)
        );
      });
  });

  return worker;
}
