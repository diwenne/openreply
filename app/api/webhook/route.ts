import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import {
  parseCommentEvents,
  parsePostbackEvents,
  parseStoryReplyEvents,
  payloadContainsMessages,
  verifyWebhookSignature,
} from "@/lib/meta/webhook";
import { POSTBACK_JOB_NAME, STORY_REPLY_JOB_NAME } from "@/lib/queue/client";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { success: false, error: "Verification failed" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Record the attempt so a signature mismatch is visible rather than a
    // silent 401. This is the common symptom of FACEBOOK_APP_SECRET being
    // set to the wrong app's secret for the webhook's signing key.
    // No body excerpt: with the `messages` field subscribed the body can
    // contain DM text, which must never reach the database.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "WARNING",
          message: "Webhook signature verification failed",
          payload: {
            hadSignatureHeader: Boolean(signature),
            bodyLength: rawBody.length,
          },
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const typedPayload = payload as Parameters<typeof parseCommentEvents>[0];

  // Privacy boundary: the `messages` field delivers every DM the account
  // receives, so a payload carrying any DM content is never persisted raw.
  // The only trace a DM may leave is the redacted audit row written below
  // for a story-reply keyword match; everything else is dropped here.
  const containsMessages = payloadContainsMessages(typedPayload);

  const webhookEvent = containsMessages
    ? null
    : await prisma.webhookEvent.create({
        data: {
          object:
            typeof payload === "object" && payload && "object" in payload
              ? String(payload.object)
              : null,
          payload: payload as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

  try {
    const commentEvents = parseCommentEvents(typedPayload);
    const queue = getDMQueue();

    for (const event of commentEvents) {
      const account = await prisma.instagramAccount.findUnique({
        where: { instagramId: event.instagramAccountId },
        select: { workspaceId: true },
      });

      await queue.add(
        "process-comment",
        {
          instagramAccountId: event.instagramAccountId,
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          mediaId: event.mediaId,
          source: "WEBHOOK",
        },
        {
          jobId: `comment_${event.instagramAccountId}_${event.commentId}`,
        }
      );

      if (account && webhookEvent) {
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { workspaceId: account.workspaceId },
        });
      }
    }

    // Button taps from opening DMs → deliver the reveal message.
    const postbackEvents = parsePostbackEvents(typedPayload);

    for (const event of postbackEvents) {
      await queue.add(
        POSTBACK_JOB_NAME,
        {
          instagramAccountId: event.instagramAccountId,
          userId: event.userId,
          payload: event.payload,
          mid: event.mid,
        },
        {
          // BullMQ forbids ":" in custom job ids, and the payload is
          // "reveal:<id>", so build with underscores and strip any colons.
          jobId: `postback_${event.instagramAccountId}_${event.userId}_${(
            event.mid ?? event.payload
          ).replace(/:/g, "_")}`,
        }
      );
    }

    // Story replies: match keywords here, before anything is enqueued or
    // stored, so a non-matching DM leaves the process with no trace at all.
    const storyReplyEvents = parseStoryReplyEvents(typedPayload);

    for (const event of storyReplyEvents) {
      const account = await prisma.instagramAccount.findUnique({
        where: { instagramId: event.instagramAccountId },
        select: { id: true, workspaceId: true },
      });
      if (!account) continue;

      const automations = await prisma.automation.findMany({
        where: {
          matchStoryReplies: true,
          isActive: true,
          instagramAccountId: account.id,
        },
        select: {
          id: true,
          keywords: true,
          matchAnyWord: true,
          wholeWordMatch: true,
        },
        orderBy: { createdAt: "asc" },
      });

      for (const automation of automations) {
        const matchResult = automation.matchAnyWord
          ? { matched: true, matchedKeyword: null }
          : matchKeywords(
              event.text,
              automation.keywords,
              automation.wholeWordMatch
            );

        if (!matchResult.matched) continue;

        await queue.add(
          STORY_REPLY_JOB_NAME,
          {
            instagramAccountId: event.instagramAccountId,
            senderId: event.senderId,
            messageId: event.messageId,
            storyId: event.storyId,
            automationId: automation.id,
            matchedKeyword: matchResult.matchedKeyword,
          },
          {
            // Message ids can contain ":" which BullMQ forbids in job ids.
            jobId: `storyreply_${event.instagramAccountId}_${event.messageId.replace(
              /:/g,
              "_"
            )}_${automation.id}`,
          }
        );

        // Redacted audit row — the only persisted trace of the DM: who
        // matched which keyword on which story. Never the message text.
        await prisma.webhookEvent.create({
          data: {
            workspaceId: account.workspaceId,
            object: "instagram",
            payload: {
              kind: "story_reply_match",
              instagramAccountId: event.instagramAccountId,
              senderId: event.senderId,
              messageId: event.messageId,
              storyId: event.storyId ?? null,
              automationId: automation.id,
              matchedKeyword: matchResult.matchedKeyword,
            },
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });
      }
    }

    if (webhookEvent) {
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (webhookEvent) {
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: "FAILED",
          errorMessage: message,
          processedAt: new Date(),
        },
      });
    } else {
      // Message payloads have no stored event row; surface the failure
      // without any content so Meta's retry is still diagnosable.
      await prisma.operationalEvent
        .create({
          data: {
            source: "SYSTEM",
            level: "ERROR",
            message: `Message webhook processing failed: ${message}`,
          },
        })
        .catch(() => {});
    }

    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
