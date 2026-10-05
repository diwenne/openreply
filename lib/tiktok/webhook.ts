import { createHmac, timingSafeEqual } from "crypto";
import { normalizeParentCommentId, parseTikTokJson } from "@/lib/tiktok/api";

// TikTok's sample tolerates a few seconds; allow five minutes for clock skew
// and queueing on TikTok's side, and at most a little clock drift forward.
const MAX_SIGNATURE_AGE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 30;

/**
 * Verify the `TikTok-Signature` header: `t=<unix seconds>,s=<hex>`, where s is
 * HMAC-SHA256 of `${t}.${rawBody}` keyed with the app secret. The raw body has
 * to be the exact bytes received, so read it before parsing.
 */
export function verifyTikTokSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!header || !secret) return false;

  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index > 0) {
      parts.set(piece.slice(0, index).trim(), piece.slice(index + 1).trim());
    }
  }

  const timestamp = parts.get("t");
  const signature = parts.get("s");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const age = Math.floor(nowMs / 1000) - Number(timestamp);
  if (age > MAX_SIGNATURE_AGE_SECONDS || age < -MAX_FUTURE_SKEW_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature.toLowerCase());
  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

export interface TikTokWebhookEnvelope {
  event: string;
  userOpenId: string;
  content: Record<string, unknown>;
}

/**
 * Parse the envelope and its `content`, which TikTok sends as a JSON string
 * that has to be parsed a second time. Both passes keep snowflake ids exact.
 */
export function parseTikTokWebhook(rawBody: string): TikTokWebhookEnvelope | null {
  let envelope: Record<string, unknown>;
  try {
    envelope = parseTikTokJson<Record<string, unknown>>(rawBody);
  } catch {
    return null;
  }
  if (!envelope || typeof envelope !== "object") return null;

  let content: unknown = envelope.content;
  if (typeof content === "string") {
    try {
      content = parseTikTokJson(content);
    } catch {
      content = {};
    }
  }

  return {
    event: typeof envelope.event === "string" ? envelope.event : "",
    userOpenId:
      typeof envelope.user_openid === "string" ? envelope.user_openid : "",
    content:
      content && typeof content === "object"
        ? (content as Record<string, unknown>)
        : {},
  };
}

export interface TikTokCommentEvent {
  /** The connected account (the video owner), not the commenter. */
  openId: string;
  commentId: string;
  videoId: string;
  /** Not documented as guaranteed; the worker looks the comment up if absent. */
  text?: string;
}

/**
 * A new top-level comment, or null for anything the automation ignores:
 * other events, deletes and visibility changes, and replies. Our own replies
 * arrive as replies too, so this alone keeps the bot from answering itself.
 */
export function toTikTokCommentEvent(
  envelope: TikTokWebhookEnvelope
): TikTokCommentEvent | null {
  if (envelope.event !== "comment.update" || !envelope.userOpenId) return null;

  const content = envelope.content;
  if (content.comment_action !== "insert") return null;

  // comment_type is the reliable discriminator; the parent id is a fallback
  // (TikTok sends parent_comment_id 0 on top-level comments).
  if (content.comment_type !== undefined && content.comment_type !== "comment") {
    return null;
  }
  if (normalizeParentCommentId(content.parent_comment_id) !== null) return null;

  const commentId = content.comment_id ? String(content.comment_id) : "";
  const videoId = content.video_id ? String(content.video_id) : "";
  if (!commentId || !videoId) return null;

  return {
    openId: envelope.userOpenId,
    commentId,
    videoId,
    text: typeof content.text === "string" ? content.text : undefined,
  };
}
