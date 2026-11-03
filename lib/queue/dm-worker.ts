import { Worker, type Job } from "bullmq";
import {
  getDMQueue,
  getRedisConnection,
  POSTBACK_JOB_NAME,
  REMINDER_JOB_NAME,
  type DmQueueJob,
  type ProcessCommentJob,
  type ProcessPostbackJob,
  type ProcessReminderJob,
} from "./client";
import { prisma } from "@/lib/db/client";
import {
  MetaApiError,
  sendCommentReply,
  sendDirectMessage,
  sendDirectMessageWithLinkButton,
  sendPrivateReply,
  sendPrivateReplyWithButton,
  sendPrivateReplyWithLinkButton,
} from "@/lib/meta/client";
import {
  sendMessengerPrivateReply,
  sendMessengerPrivateReplyWithLinkButton,
  sendMessengerDirectMessage,
  sendMessengerDirectMessageWithLinkButton,
  sendFacebookCommentReply,
} from "@/lib/meta/facebook-client";
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
  renderMessageWithTracking,
  renderMessageWithoutLink,
} from "@/lib/tracking/message";

const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
// Safety margin before the 24h window closes, absorbing comment→send latency
// and clock skew. ponytail: 1h is conservative; tune if reminders are dropped.
const REMINDER_SAFETY_BUFFER_MS = 60 * 60 * 1000;

function formatError(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `Meta API Error ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function senders(platform: "INSTAGRAM" | "FACEBOOK") {
  if (platform === "FACEBOOK") {
    return {
      privateReply: sendMessengerPrivateReply,
      privateReplyWithLinkButton: sendMessengerPrivateReplyWithLinkButton,
      directMessage: sendMessengerDirectMessage,
      directMessageWithLinkButton: sendMessengerDirectMessageWithLinkButton,
      commentReply: sendFacebookCommentReply,
    };
  }
  return {
    privateReply: sendPrivateReply,
    privateReplyWithLinkButton: sendPrivateReplyWithLinkButton,
    directMessage: sendDirectMessage,
    directMessageWithLinkButton: sendDirectMessageWithLinkButton,
    commentReply: sendCommentReply,
  };
}

async function processComment(job: Job<ProcessCommentJob>): Promise<void> {
  const {
    instagramAccountId,
    commentId,
    commentText,
    commenterId,
    commenterName,
    mediaId,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;

  const automations = await prisma.automation.findMany({
    where: {
      // Match campaigns bound to this specific post, plus any-post campaigns.
      OR: [{ postId: mediaId }, { matchAnyPost: true }],
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

    if (!automation.instagramAccount.accessToken) {
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

    let accessToken: string;
    try {
      accessToken = decryptToken(automation.instagramAccount.accessToken);
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

    const platform = automation.instagramAccount.platform;
    const send = senders(platform);

    // Ensure a log row exists before the public reply leg (which updates it).
    // Only (re)set PENDING when the DM will actually be attempted, so a prior
    // SENT is never clobbered while we come back just to retry the public reply.
    let createdLog: { id: string } | null = null;
    if (!existingLog) {
      createdLog = await prisma.dmLog.create({
        data: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
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

    const dmLogId = existingLog?.id ?? createdLog!.id;

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
        });
        await send.commentReply(accessToken, commentId, publicReply);
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
            jobId: `comment_${instagramAccountId}_${commentId}_retry_${requeueAttempt + 1}`,
          }
        );
        continue;
      }
    }

    // With an opening DM, the private reply is a button message; tapping it
    // fires a postback that delivers the reveal (see processPostback). Without
    // one, we send the reveal text directly as today.
    // ponytail: FB has no postback-button opening-DM flow in v1; FB campaigns send the link DM directly.
    const useOpeningDm =
      platform === "INSTAGRAM" &&
      automation.openingDmEnabled &&
      Boolean(automation.openingDmMessage) &&
      Boolean(automation.openingDmButtonLabel);

    try {
      if (useOpeningDm) {
        const openingText = renderMessageWithTracking({
          message: automation.openingDmMessage as string,
          commenterName,
          trackedLinks: [],
        });
        await sendPrivateReplyWithButton(
          accessToken,
          automation.instagramAccount.instagramId,
          commentId,
          openingText,
          automation.openingDmButtonLabel as string,
          `reveal:${automation.id}`
        );
      } else if (automation.trackedLinks[0]) {
        // Try button template first; if Meta rejects it, fall back to inline link.
        const bodyText =
          renderMessageWithoutLink({
            message: automation.dmMessage,
            commenterName,
          }) || "Here's your link:";
        const trackedUrl = buildTrackedUrl(
          automation.trackedLinks[0].slug,
          undefined,
          dmLogId
        );

        try {
          await send.privateReplyWithLinkButton(
            accessToken,
            automation.instagramAccount.instagramId,
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
              message: automation.dmMessage,
              commenterName,
              trackedLinks: [automation.trackedLinks[0]],
              dmLogId,
            }) || `${bodyText}\n${trackedUrl}`;
          await send.privateReply(
            accessToken,
            automation.instagramAccount.instagramId,
            commentId,
            fallbackMessage
          );
        }
      } else {
        const dmMessage = renderMessageWithTracking({
          message: automation.dmMessage,
          commenterName,
          trackedLinks: automation.trackedLinks,
          dmLogId,
        });
        await send.privateReply(
          accessToken,
          automation.instagramAccount.instagramId,
          commentId,
          dmMessage
        );
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

      // Best-effort "you didn't click yet" reminder. Deterministic jobId dedups
      // so re-processing the same comment never schedules a second reminder.
      // Never let an enqueue failure fail the send.
      if (
        automation.reminderEnabled &&
        automation.reminderMessage &&
        automation.trackedLinks[0] &&
        !useOpeningDm
      ) {
        try {
          const delayMinutes = automation.reminderDelayMinutes ?? 60;
          const delay = Math.min(
            delayMinutes * 60_000,
            MESSAGING_WINDOW_MS - REMINDER_SAFETY_BUFFER_MS
          );
          if (delay > 0) {
            await getDMQueue().add(
              REMINDER_JOB_NAME,
              { dmLogId, instagramAccountId },
              { delay, jobId: `reminder_${dmLogId}` }
            );
          }
        } catch (reminderError) {
          console.error(
            "[DM Worker] Failed to schedule reminder:",
            formatError(reminderError)
          );
        }
      }
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
 * Instagram-only: postbacks only come from IG opening DMs (FB has no
 * postback-button opening-DM flow in v1), so no platform dispatch here.
 */
async function processPostback(job: Job<ProcessPostbackJob>): Promise<void> {
  const { instagramAccountId, userId, payload } = job.data;

  if (!payload.startsWith("reveal:")) return;
  const automationId = payload.slice("reveal:".length);

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, destinationUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (
    !automation ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !automation.instagramAccount.accessToken
  ) {
    return;
  }

  // Duplicate sends are enabled: every button tap re-sends the reveal
  // instead of only firing once per person.
  const dedupeId = `reveal:${userId}`;

  // Personalize {username} from the opening DM log for this user, if present.
  const openingLog = await prisma.dmLog.findFirst({
    where: { automationId: automation.id, commenterId: userId },
    select: { commenterName: true },
  });
  const commenterName = openingLog?.commenterName ?? null;

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.instagramAccount.accessToken);
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

  const primaryLink = automation.trackedLinks[0];

  try {
    if (primaryLink) {
      // Try button template first; if Meta rejects it, fall back to inline link.
      const bodyText =
        renderMessageWithoutLink({
          message: automation.dmMessage,
          commenterName,
        }) || "Here's your link:";
      const trackedUrl = buildTrackedUrl(primaryLink.slug);

      try {
        await sendDirectMessageWithLinkButton(
          accessToken,
          automation.instagramAccount.instagramId,
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
            message: automation.dmMessage,
            commenterName,
            trackedLinks: [primaryLink],
          }) || `${bodyText}\n${trackedUrl}`;
        await sendDirectMessage(
          accessToken,
          automation.instagramAccount.instagramId,
          userId,
          fallbackMessage
        );
      }
    } else {
      const revealMessage = renderMessageWithTracking({
        message: automation.dmMessage,
        commenterName,
        trackedLinks: automation.trackedLinks,
      });
      await sendDirectMessage(
        accessToken,
        automation.instagramAccount.instagramId,
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
  } catch (error) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
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
      },
      update: { status: "FAILED", errorMessage: formatError(error) },
    });
    throw error;
  }
}

/**
 * Send one "you didn't click yet" reminder DM, if the commenter hasn't clicked
 * the tracked link and we're still inside Instagram's 24h messaging window.
 * Idempotent via reminderSentAt; records why it skipped in reminderSkippedReason.
 */
async function processReminder(job: Job<ProcessReminderJob>): Promise<void> {
  const { dmLogId } = job.data;

  const dmLog = await prisma.dmLog.findUnique({
    where: { id: dmLogId },
    include: {
      automation: {
        include: {
          instagramAccount: true,
          workspace: true,
          trackedLinks: {
            select: { slug: true, destinationUrl: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!dmLog) return;
  if (dmLog.reminderSentAt) return; // already sent — idempotent

  const automation = dmLog.automation;
  if (!automation.reminderEnabled || !automation.reminderMessage) return;

  // Clicked already — no nudge needed.
  const clicked = await prisma.linkClick.findFirst({ where: { dmLogId } });
  if (clicked) {
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderSkippedReason: "clicked" },
    });
    return;
  }

  // Outside the safe 24h messaging window — sending would be rejected.
  const elapsed = Date.now() - dmLog.createdAt.getTime();
  if (elapsed >= MESSAGING_WINDOW_MS - REMINDER_SAFETY_BUFFER_MS) {
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderSkippedReason: "window_expired" },
    });
    return;
  }

  if (!automation.instagramAccount.accessToken) {
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderError: "No Instagram access token available" },
    });
    return;
  }

  let token: string;
  try {
    token = decryptToken(automation.instagramAccount.accessToken);
  } catch {
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderError: "Failed to decrypt Instagram access token" },
    });
    return;
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderSkippedReason: "plan_limit" },
    });
    return;
  }

  const rateLimit = await reserveDMSlot(automation.instagramAccount.instagramId);
  if (!rateLimit.allowed) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    // ponytail: a dropped reminder is acceptable; add requeue if needed.
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderSkippedReason: "rate_limit" },
    });
    return;
  }

  // Attribute a click on the reminder's link too, via ?c=<dmLogId>.
  const text = renderMessageWithTracking({
    message: automation.reminderMessage,
    commenterName: dmLog.commenterName,
    trackedLinks: automation.trackedLinks,
    dmLogId,
  });

  const send = senders(automation.instagramAccount.platform);

  try {
    await send.directMessage(
      token,
      automation.instagramAccount.instagramId,
      dmLog.commenterId,
      text
    );
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderSentAt: new Date(), reminderError: null },
    });
  } catch (error) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    await prisma.dmLog.update({
      where: { id: dmLogId },
      data: { reminderError: formatError(error) },
    });
    throw error; // let BullMQ retry within attempts
  }
}

async function processJob(job: Job<DmQueueJob>): Promise<void> {
  if (job.name === POSTBACK_JOB_NAME) {
    return processPostback(job as Job<ProcessPostbackJob>);
  }
  if (job.name === REMINDER_JOB_NAME) {
    return processReminder(job as Job<ProcessReminderJob>);
  }
  return processComment(job as Job<ProcessCommentJob>);
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

