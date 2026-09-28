import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isTikTokConfigured } from "@/lib/env";
import { enqueueTikTokComment } from "@/lib/tiktok/queue";
import {
  parseTikTokWebhook,
  toTikTokCommentEvent,
  verifyTikTokSignature,
} from "@/lib/tiktok/webhook";

/**
 * TikTok COMMENT webhook. TikTok retries any non-200 for up to 72 hours and
 * delivers at least once, so this only verifies, filters and queues; the
 * worker's database claim handles duplicates.
 */
export async function POST(request: NextRequest) {
  if (!isTikTokConfigured()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  // Signed over the exact bytes received, so read the raw body first.
  const rawBody = await request.text();
  const signature = request.headers.get("tiktok-signature");

  if (!verifyTikTokSignature(rawBody, signature, process.env.TIKTOK_APP_SECRET)) {
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "WARNING",
          message: "TikTok webhook signature verification failed",
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

  const envelope = parseTikTokWebhook(rawBody);
  if (!envelope) {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (envelope.event === "authorization.removed" && envelope.userOpenId) {
    // The owner revoked access in TikTok. Keep the row so the dashboard can
    // show it, and make the next API call fail fast by expiring the token.
    await prisma.tikTokAccount.updateMany({
      where: { openId: envelope.userOpenId },
      data: { tokenExpiresAt: new Date(0), refreshTokenExpiresAt: new Date(0) },
    });
    return NextResponse.json({ success: true });
  }

  const event = toTikTokCommentEvent(envelope);
  if (!event) return NextResponse.json({ success: true });

  const account = await prisma.tikTokAccount.findUnique({
    where: { openId: event.openId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ success: true });

  try {
    await enqueueTikTokComment({
      tiktokAccountId: account.id,
      commentId: event.commentId,
      videoId: event.videoId,
      text: event.text,
      source: "WEBHOOK",
    });
  } catch (error) {
    console.error("[TikTok Webhook] Enqueue failed:", error);
    // A non-200 makes TikTok deliver the event again later.
    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
