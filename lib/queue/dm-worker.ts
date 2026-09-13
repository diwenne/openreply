import { Worker, type Job } from "bullmq";
import {
  getDMQueue,
  getRedisConnection,
  POSTBACK_JOB_NAME,
  STORY_REPLY_JOB_NAME,
  type DmQueueJob,
  type ProcessCommentJob,
  type ProcessPostbackJob,
  type ProcessStoryReplyJob,
} from "./client";
import { prisma } from "@/lib/db/client";
import {
  getMessagingUserProfile,
  MetaApiError,
  sendCommentReply,
  sendDirectMessage,
  sendDirectMessageWithButton,
  sendDirectMessageWithLinkButton,
  sendFacebookCommentReply,
  sendFacebookPrivateReply,
  sendPrivateReply,
  sendPrivateReplyWithButton,
  sendPrivateReplyWithLinkButton,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import { reserveDMSlot } from "@/lib/utils/rate-limiter";
import {
  releaseWorkspaceDMReservation,
  reserveWorkspaceDMSend,
} from "@/lib/billing/usage";
import { recordWorkerAlert } from "@/lib/ops/worker-health";
import {
  buildTrackedUrl,
  buildTrackingSrc,
  renderMessageWithTracking,
  renderMessageWithoutLink,
} from "@/lib/tracking/message";

const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

function formatError(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `Meta API Error ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function processComment(job: Job<ProcessCommentJob>): Promise<void> {
  const {
    socialAccountId,
    commentId,
    commentText,
    commenterId,
    commenterName,
    mediaId,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;
  // Per-post attribution: every tracked link sent for this comment carries
  // ?src=ig<mediaId> so a vote on the destination site maps back to the reel.
  const trackingSrc = buildTrackingSrc(mediaId);

  const automations = await prisma.automation.findMany({
    where: {
      // Match campaigns bound to this specific post, plus any-post campaigns.
      OR: [{ postId: mediaId }, { matchAnyPost: true }],
      isActive: true,
      socialAccount: {
        externalId: socialAccountId,
      },
    },
    include: {
      socialAccount: true,
      workspace: true,
      trackedLinks: {
        select: {
          slug: true,
          destinationUrl: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const automation of automations) {
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

    const alreadyDmd = existingLog?.status === "SENT";
    const alreadyPublicReplied = Boolean(existingLog?.publicReplySentAt);
    const needsDm = !alreadyDmd;

    // Skip only when there is genuinely nothing left to do. A comment whose DM
    // already sent but whose public reply never posted (e.g. it hit a rate
    // limit) must still come back so the public reply can be retried.
    if (existingLog?.status === "SKIPPED_PLAN_LIMIT") continue;
    if (alreadyDmd && (alreadyPublicReplied || !automation.publicReplyEnabled)) {
      continue;
    }

    if (!automation.socialAccount.accessToken) {
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
          socialAccountId: automation.socialAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          mediaId,
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

    let accessToken: string;
    try {
      accessToken = decryptToken(automation.socialAccount.accessToken);
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
          socialAccountId: automation.socialAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          mediaId,
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

    // Ensure a log row exists before the public reply leg (which updates it).
    // Only (re)set PENDING when the DM will actually be attempted, so a prior
    // SENT is never clobbered while we come back just to retry the public reply.
    if (!existingLog) {
      await prisma.dmLog.create({
        data: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          socialAccountId: automation.socialAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          mediaId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "PENDING",
          attempts: job.attemptsMade + 1,
        },
      });
    } else if (needsDm) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: { automationId: automation.id, commentId },
        },
        data: {
          status: "PENDING",
          attempts: job.attemptsMade + 1,
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: null,
        },
      });
    }

    // Public reply leg — decoupled from the DM and posted first so a DM failure
    // (e.g. a non-follower whose messaging is restricted) never suppresses it.
    // Idempotent across retries via publicReplySentAt.
    const replyPool =
      automation.publicReplyMessages.length > 0
        ? automation.publicReplyMessages
        : automation.publicReplyMessage
          ? [automation.publicReplyMessage]
          : [];
    if (
      automation.publicReplyEnabled &&
      replyPool.length > 0 &&
      !existingLog?.publicReplySentAt
    ) {
      try {
        const chosen = replyPool[Math.floor(Math.random() * replyPool.length)];
        const publicReply = renderMessageWithTracking({
          message: chosen,
          commenterName,
          trackedLinks: automation.trackedLinks,
          src: trackingSrc,
        });
        if (automation.socialAccount.platform === "FACEBOOK") {
          await sendFacebookCommentReply(accessToken, commentId, publicReply);
        } else {
          await sendCommentReply(accessToken, commentId, publicReply);
        }
        await prisma.dmLog.update({
          where: {
            automationId_commentId: { automationId: automation.id, commentId },
          },
          data: { publicReplySentAt: new Date(), publicReplyError: null },
        });
      } catch (error) {
        console.error(
          "[DM Worker] Public comment reply failed:",
          formatError(error)
        );
        await prisma.dmLog
          .update({
            where: {
              automationId_commentId: { automationId: automation.id, commentId },
            },
            data: { publicReplyError: formatError(error) },
          })
          .catch(() => {});
      }
    }

    // DM already sent on an earlier pass; the public reply retry above was all
    // this run needed. Don't re-send the DM.
    if (!needsDm) continue;

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
      rateLimit = await reserveDMSlot(socialAccountId, requeueAttempt);
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
          attempts: job.attemptsMade + 1,
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
            jobId: `comment_${socialAccountId}_${commentId}_retry_${requeueAttempt + 1}`,
          }
        );
        continue;
      }
    }

    // With an opening DM, the private reply is a button message; tapping it
    // fires a postback that delivers the reveal (see processPostback). Without
    // one, we send the reveal text directly as today.
    // Both the opening-DM button flow and the tracked-link BUTTON template are
    // Instagram Send API features — Facebook Pages only got a plain Private
    // Reply in this pass (Meta docs research covered POST /{page}/messages,
    // not button templates), so a Facebook automation always takes the plain
    // text path below, with any tracked link inlined into the text instead.
    const isFacebook = automation.socialAccount.platform === "FACEBOOK";
    const useOpeningDm =
      !isFacebook &&
      automation.openingDmEnabled &&
      Boolean(automation.openingDmMessage) &&
      Boolean(automation.openingDmButtonLabel);
    // Rotate DM variants — same random-pick pattern as the public-reply pool
    // above. Picked ONCE per send: the three branches below are alternate
    // FORMATS of the same message (button/inline-link/plain), never different
    // messages for the same comment.
    const dmPool =
      automation.dmMessages.length > 0
        ? automation.dmMessages
        : [automation.dmMessage];
    const chosenDm = dmPool[Math.floor(Math.random() * dmPool.length)];

    try {
      if (useOpeningDm) {
        const openingText = renderMessageWithTracking({
          message: automation.openingDmMessage as string,
          commenterName,
          trackedLinks: [],
        });
        await sendPrivateReplyWithButton(
          accessToken,
          automation.socialAccount.externalId,
          commentId,
          openingText,
          automation.openingDmButtonLabel as string,
          `reveal:${automation.id}`
        );
      } else if (automation.trackedLinks[0] && !isFacebook) {
        // Try button template first; if Meta rejects it, fall back to inline link.
        const bodyText =
          renderMessageWithoutLink({
            message: chosenDm,
            commenterName,
          }) || "Here's your link:";
        const trackedUrl = buildTrackedUrl(
          automation.trackedLinks[0].slug,
          undefined,
          trackingSrc
        );

        try {
          await sendPrivateReplyWithLinkButton(
            accessToken,
            automation.socialAccount.externalId,
            commentId,
            bodyText,
            automation.linkButtonLabel || "Open link",
            trackedUrl
          );
        } catch (buttonError) {
          // Button template rejected; send as text with inline link instead.
          console.log(
            "[DM Worker] Button template rejected, falling back to inline link:",
            formatError(buttonError)
          );
          const fallbackMessage =
            renderMessageWithTracking({
              message: chosenDm,
              commenterName,
              trackedLinks: [automation.trackedLinks[0]],
              src: trackingSrc,
            }) || `${bodyText}\n${trackedUrl}`;
          await sendPrivateReply(
            accessToken,
            automation.socialAccount.externalId,
            commentId,
            fallbackMessage
          );
        }
      } else {
        const dmMessage = renderMessageWithTracking({
          message: chosenDm,
          commenterName,
          trackedLinks: automation.trackedLinks,
          src: trackingSrc,
        });
        if (isFacebook) {
          await sendFacebookPrivateReply(
            accessToken,
            automation.socialAccount.externalId,
            commentId,
            dmMessage
          );
        } else {
          await sendPrivateReply(
            accessToken,
            automation.socialAccount.externalId,
            commentId,
            dmMessage
          );
        }
      }

      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SENT",
          dmSentAt: new Date(),
          errorMessage: null,
        },
      });
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
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
        },
      });
      throw error;
    }
  }
}

/**
 * Deliver the reveal message after a user taps an opening DM's button.
 * The postback payload is `reveal:<automationId>`; the sender is the user's
 * IGSID (same id as their comment author id), which we DM directly.
 */
async function processPostback(job: Job<ProcessPostbackJob>): Promise<void> {
  const { socialAccountId, userId, payload } = job.data;

  if (!payload.startsWith("reveal:")) return;
  const automationId = payload.slice("reveal:".length);

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true },
    include: {
      socialAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, destinationUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (
    !automation ||
    automation.socialAccount.externalId !== socialAccountId ||
    !automation.socialAccount.accessToken
  ) {
    return;
  }

  // Duplicate sends are enabled: every button tap re-sends the reveal
  // instead of only firing once per person.
  const dedupeId = `reveal:${userId}`;

  // Personalize {username} from the opening DM log for this user, if present,
  // and recover the post they commented on so the reveal link keeps the same
  // per-post attribution as the opening DM. Button-tap rows never carry a
  // media id, hence the newest row that has one; a story-reply origin has
  // none at all, in which case no src is added (behaviour unchanged).
  const [openingLog, sourceLog] = await Promise.all([
    prisma.dmLog.findFirst({
      where: { automationId: automation.id, commenterId: userId },
      orderBy: { createdAt: "desc" },
      select: { commenterName: true },
    }),
    prisma.dmLog.findFirst({
      where: {
        automationId: automation.id,
        commenterId: userId,
        mediaId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { mediaId: true },
    }),
  ]);
  const commenterName = openingLog?.commenterName ?? null;
  const sourceMediaId = sourceLog?.mediaId ?? null;
  const trackingSrc = buildTrackingSrc(sourceMediaId);

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.socialAccount.accessToken);
  } catch {
    return;
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        socialAccountId: automation.socialAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        mediaId: sourceMediaId,
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
      update: { status: "SKIPPED_PLAN_LIMIT" },
    });
    return;
  }

  const primaryLink = automation.trackedLinks[0];
  // Same rotation as processComment — one pick reused across the three
  // alternate send formats below.
  const dmPoolPostback =
    automation.dmMessages.length > 0
      ? automation.dmMessages
      : [automation.dmMessage];
  const chosenDmPostback =
    dmPoolPostback[Math.floor(Math.random() * dmPoolPostback.length)];

  try {
    if (primaryLink) {
      // Try button template first; if Meta rejects it, fall back to inline link.
      const bodyText =
        renderMessageWithoutLink({
          message: chosenDmPostback,
          commenterName,
        }) || "Here's your link:";
      const trackedUrl = buildTrackedUrl(primaryLink.slug, undefined, trackingSrc);

      try {
        await sendDirectMessageWithLinkButton(
          accessToken,
          automation.socialAccount.externalId,
          userId,
          bodyText,
          automation.linkButtonLabel || "Open link",
          trackedUrl
        );
      } catch (buttonError) {
        // Button template rejected; send as text with inline link instead.
        console.log(
          "[DM Worker] Button template rejected in postback, falling back to inline link:",
          formatError(buttonError)
        );
        const fallbackMessage =
          renderMessageWithTracking({
            message: chosenDmPostback,
            commenterName,
            trackedLinks: [primaryLink],
            src: trackingSrc,
          }) || `${bodyText}\n${trackedUrl}`;
        await sendDirectMessage(
          accessToken,
          automation.socialAccount.externalId,
          userId,
          fallbackMessage
        );
      }
    } else {
      const revealMessage = renderMessageWithTracking({
        message: chosenDmPostback,
        commenterName,
        trackedLinks: automation.trackedLinks,
        src: trackingSrc,
      });
      await sendDirectMessage(
        accessToken,
        automation.socialAccount.externalId,
        userId,
        revealMessage
      );
    }
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        socialAccountId: automation.socialAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        mediaId: sourceMediaId,
        status: "SENT",
        dmSentAt: new Date(),
      },
      update: { status: "SENT", dmSentAt: new Date(), errorMessage: null },
    });
  } catch (error) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        socialAccountId: automation.socialAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        mediaId: sourceMediaId,
        status: "FAILED",
        errorMessage: formatError(error),
      },
      update: { status: "FAILED", errorMessage: formatError(error) },
    });
    throw error;
  }
}

/**
 * Send the campaign DM for a story-reply keyword match. The webhook route has
 * already matched the keyword, so this job carries only match metadata — never
 * the reply text, which is never stored anywhere. Replying is allowed because
 * the user's story reply opened Meta's 24-hour messaging window.
 */
async function processStoryReply(
  job: Job<ProcessStoryReplyJob>
): Promise<void> {
  const {
    socialAccountId,
    senderId,
    messageId,
    storyId,
    automationId,
    matchedKeyword,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true, matchStoryReplies: true },
    include: {
      socialAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, destinationUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (
    !automation ||
    automation.socialAccount.externalId !== socialAccountId ||
    !automation.socialAccount.accessToken
  ) {
    return;
  }

  // One DM per matched story reply per campaign, keyed by the message id.
  const logKey = {
    automationId_commentId: {
      automationId: automation.id,
      commentId: messageId,
    },
  };
  const existingLog = await prisma.dmLog.findUnique({ where: logKey });
  if (
    existingLog?.status === "SENT" ||
    existingLog?.status === "SKIPPED_PLAN_LIMIT"
  ) {
    return;
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.socialAccount.accessToken);
  } catch {
    await prisma.dmLog.upsert({
      where: logKey,
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        socialAccountId: automation.socialAccountId,
        commenterId: senderId,
        commentText: "(story reply)",
        commentId: messageId,
        matchedKeyword,
        storyId: storyId ?? null,
        status: "FAILED",
        errorMessage: "Failed to decrypt Instagram access token",
      },
      update: {
        status: "FAILED",
        errorMessage: "Failed to decrypt Instagram access token",
      },
    });
    return;
  }

  // Label the log with the sender's username — matched senders only.
  let commenterName: string | null = existingLog?.commenterName ?? null;
  if (!commenterName) {
    try {
      commenterName =
        (await getMessagingUserProfile(accessToken, senderId)).username ?? null;
    } catch {
      commenterName = null;
    }
  }

  await prisma.dmLog.upsert({
    where: logKey,
    create: {
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      socialAccountId: automation.socialAccountId,
      commenterId: senderId,
      commenterName,
      // The reply text is never stored; the matched keyword is the trigger.
      commentText: "(story reply)",
      commentId: messageId,
      matchedKeyword,
      storyId: storyId ?? null,
      status: "PENDING",
      attempts: job.attemptsMade + 1,
    },
    update: {
      status: "PENDING",
      attempts: job.attemptsMade + 1,
      matchedKeyword,
      errorMessage: null,
      ...(commenterName ? { commenterName } : {}),
    },
  });

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.update({
      where: logKey,
      data: {
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
    });
    return;
  }

  let rateLimit;
  try {
    rateLimit = await reserveDMSlot(socialAccountId, requeueAttempt);
  } catch (error) {
    await releaseWorkspaceDMReservation(
      automation.workspaceId,
      usage.periodStart
    );
    await prisma.dmLog.update({
      where: logKey,
      data: {
        status: "FAILED",
        attempts: job.attemptsMade + 1,
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
        where: logKey,
        data: {
          status: "SKIPPED_RATE_LIMIT",
          errorMessage: "Hourly Instagram DM rate limit reached",
        },
      });
      return;
    }

    if (rateLimit.shouldRequeue) {
      await prisma.dmLog.update({
        where: logKey,
        data: {
          status: "PENDING",
          errorMessage: "Hourly rate limit hit; retry scheduled",
        },
      });

      await getDMQueue().add(
        STORY_REPLY_JOB_NAME,
        {
          ...job.data,
          requeueAttempt: requeueAttempt + 1,
        },
        {
          delay: rateLimit.requeueDelayMs,
          jobId: `storyreply_${socialAccountId}_${messageId.replace(
            /:/g,
            "_"
          )}_${automation.id}_retry_${requeueAttempt + 1}`,
        }
      );
      return;
    }
  }

  // With an opening DM, the reply is a postback-button message; tapping it
  // delivers the reveal (see processPostback — same flow as comment campaigns).
  const useOpeningDm =
    automation.openingDmEnabled &&
    Boolean(automation.openingDmMessage) &&
    Boolean(automation.openingDmButtonLabel);

  const primaryLink = automation.trackedLinks[0];
  // Same rotation as processComment/processPostback.
  const dmPoolStory =
    automation.dmMessages.length > 0
      ? automation.dmMessages
      : [automation.dmMessage];
  const chosenDmStory = dmPoolStory[Math.floor(Math.random() * dmPoolStory.length)];

  try {
    if (useOpeningDm) {
      const openingText = renderMessageWithTracking({
        message: automation.openingDmMessage as string,
        commenterName,
        trackedLinks: [],
      });
      await sendDirectMessageWithButton(
        accessToken,
        automation.socialAccount.externalId,
        senderId,
        openingText,
        automation.openingDmButtonLabel as string,
        `reveal:${automation.id}`
      );
    } else if (primaryLink) {
      // Try button template first; if Meta rejects it, fall back to inline link.
      const bodyText =
        renderMessageWithoutLink({
          message: chosenDmStory,
          commenterName,
        }) || "Here's your link:";
      const trackedUrl = buildTrackedUrl(primaryLink.slug);

      try {
        await sendDirectMessageWithLinkButton(
          accessToken,
          automation.socialAccount.externalId,
          senderId,
          bodyText,
          automation.linkButtonLabel || "Open link",
          trackedUrl
        );
      } catch (buttonError) {
        // Button template rejected; send as text with inline link instead.
        console.log(
          "[DM Worker] Button template rejected for story reply, falling back to inline link:",
          formatError(buttonError)
        );
        const fallbackMessage =
          renderMessageWithTracking({
            message: chosenDmStory,
            commenterName,
            trackedLinks: [primaryLink],
          }) || `${bodyText}\n${trackedUrl}`;
        await sendDirectMessage(
          accessToken,
          automation.socialAccount.externalId,
          senderId,
          fallbackMessage
        );
      }
    } else {
      const dmMessage = renderMessageWithTracking({
        message: chosenDmStory,
        commenterName,
        trackedLinks: automation.trackedLinks,
      });
      await sendDirectMessage(
        accessToken,
        automation.socialAccount.externalId,
        senderId,
        dmMessage
      );
    }

    await prisma.dmLog.update({
      where: logKey,
      data: {
        status: "SENT",
        dmSentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await releaseWorkspaceDMReservation(
      automation.workspaceId,
      usage.periodStart
    );

    await prisma.dmLog.update({
      where: logKey,
      data: {
        status: "FAILED",
        attempts: job.attemptsMade + 1,
        errorMessage: formatError(error),
      },
    });
    throw error;
  }
}

async function processJob(job: Job<DmQueueJob>): Promise<void> {
  if (job.name === POSTBACK_JOB_NAME) {
    return processPostback(job as Job<ProcessPostbackJob>);
  }
  if (job.name === STORY_REPLY_JOB_NAME) {
    return processStoryReply(job as Job<ProcessStoryReplyJob>);
  }
  return processComment(job as Job<ProcessCommentJob>);
}

async function recordWorkerFailure(
  job: Job<DmQueueJob> | undefined,
  error: Error
) {
  try {
    const socialAccountId = job?.data.socialAccountId;
    const commentId =
      job && "commentId" in job.data
        ? job.data.commentId
        : job && "messageId" in job.data
          ? job.data.messageId
          : null;
    const account = socialAccountId
      ? await prisma.socialAccount.findUnique({
          where: { externalId: socialAccountId },
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
          socialAccountId: socialAccountId ?? null,
          commentId,
        },
      },
    });

    await recordWorkerAlert({
      level: "error",
      message: error.message,
      jobId: job?.id,
      socialAccountId,
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
  const worker = new Worker<DmQueueJob>(
    "dm-processing",
    processJob,
    {
      connection: getRedisConnection(),
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          BACKOFF_DELAYS[Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1)],
      },
    }
  );

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

