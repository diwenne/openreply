import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!signature) return false;

  // Instagram-Login apps sign webhooks with the Instagram app secret, while
  // Facebook-Login apps use the Facebook app secret. Both belong to the same
  // app, so accept a signature that matches either — this avoids a config
  // guess about which key Meta uses for a given app type.
  const secrets = [
    process.env.FACEBOOK_APP_SECRET,
    process.env.INSTAGRAM_APP_SECRET,
  ].filter((s): s is string => Boolean(s));

  if (secrets.length === 0) {
    throw new Error(
      "FACEBOOK_APP_SECRET or INSTAGRAM_APP_SECRET is required to verify webhooks"
    );
  }

  return secrets.some((secret) => {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

/**
 * Why a webhook failed signature verification, without revealing any secret:
 * which kind of event it was, and whether a configured secret only matches
 * once surrounding whitespace is trimmed (a common copy-paste mistake).
 * Used to tell a second app or subscription posting to this URL apart from a
 * misconfigured secret.
 */
export function describeSignatureFailure(payload: string, signature: string | null) {
  const secrets = {
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
  };
  const matches = (secret: string) =>
    !!signature &&
    signature === "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

  const trimmedSecretMatches = Object.entries(secrets)
    .filter(([, secret]) => secret && secret !== secret.trim() && matches(secret.trim()))
    .map(([name]) => name);

  let object: string | null = null;
  const entryIds: string[] = [];
  const kinds = new Set<string>();
  try {
    const parsed = JSON.parse(payload) as {
      object?: string;
      entry?: Array<{ id?: string; changes?: Array<{ field?: string }>; messaging?: Array<Record<string, unknown>> }>;
    };
    object = parsed.object ?? null;
    for (const entry of parsed.entry ?? []) {
      if (entry.id) entryIds.push(entry.id);
      for (const change of entry.changes ?? []) if (change.field) kinds.add(`changes.${change.field}`);
      for (const messaging of entry.messaging ?? [])
        for (const key of Object.keys(messaging))
          if (!["sender", "recipient", "timestamp"].includes(key)) kinds.add(`messaging.${key}`);
    }
  } catch {
    kinds.add("unparseable");
  }

  return {
    hadSignatureHeader: Boolean(signature),
    signatureFormatOk: /^sha256=[0-9a-f]{64}$/.test(signature ?? ""),
    configuredSecrets: Object.entries(secrets).filter(([, v]) => v).map(([k]) => k),
    trimmedSecretMatches,
    object,
    entryIds,
    eventKinds: [...kinds],
    bodyLength: payload.length,
  };
}

export interface WebhookCommentEvent {
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  /**
   * Set only when the comment was left on an ad: the id of the organic post
   * the ad was created from. Campaigns are configured against that post, so
   * matching has to consider it as well as mediaId.
   */
  originalMediaId?: string;
}

interface WebhookEntry {
  id: string;
  time: number;
  changes?: Array<{
    field: string;
    value: {
      id?: string;
      comment_id?: string;
      text?: string;
      from?: {
        id?: string;
        username?: string;
      };
      media?: {
        id?: string;
        // Present when media_product_type is "AD": the ad copy gets its own
        // media id, and this points back to the post it was boosted from.
        original_media_id?: string;
        ad_id?: string;
        media_product_type?: string;
      };
      media_id?: string;
    };
  }>;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    postback?: { mid?: string; title?: string; payload?: string };
    read?: { watermark?: number; seq?: number };
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
      is_deleted?: boolean;
      is_unsupported?: boolean;
      attachments?: Array<{ type?: string }>;
      quick_reply?: { payload?: string };
    };
  }>;
}

// Payload prefixes this app puts on buttons and quick replies. A quick reply
// tap carrying one is a button tap, not a typed message.
const OWN_PAYLOAD_PATTERN = /^(qr|reveal|followcheck):/;

function ownQuickReplyPayload(
  message: { quick_reply?: { payload?: string }; is_echo?: boolean } | undefined
): string | null {
  const payload = message?.quick_reply?.payload;
  if (!payload || message?.is_echo) return null;
  return OWN_PAYLOAD_PATTERN.test(payload) ? payload : null;
}

export interface WebhookMessageEvent {
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
}

export interface WebhookPostbackEvent {
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
}

export interface WebhookReadEvent {
  instagramAccountId: string;
  userId: string;
  watermark?: number;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export function parseCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  if (payload.object !== "instagram") {
    return events;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;

      const value = change.value;
      const commentId = value?.id ?? value?.comment_id;
      const mediaId = value?.media?.id ?? value?.media_id;
      // A comment on a boosted post arrives with the ad's media id, while the
      // campaign is set up against the organic post. Keep both so the worker
      // can match either one.
      const originalMediaId =
        value?.media?.original_media_id === mediaId
          ? undefined
          : value?.media?.original_media_id;
      const commenterId = value?.from?.id;

      if (!entry.id || !commentId || !mediaId || !commenterId) {
        continue;
      }

      // Skip the connected account's own comments and comment replies.
      // A private reply to yourself is rejected by Meta, so queueing one
      // only produces a failed log and wasted retries.
      if (commenterId === entry.id) {
        continue;
      }

      events.push({
        instagramAccountId: entry.id,
        commentId,
        commentText: value.text ?? "",
        commenterId,
        commenterName: value.from?.username,
        mediaId,
        originalMediaId,
      });
    }
  }

  return events;
}

/**
 * Parse button-tap postbacks (from an opening DM's button) out of a webhook
 * payload. Each event carries the tapping user's IGSID and our postback payload.
 */
export function parsePostbackEvents(
  payload: WebhookPayload
): WebhookPostbackEvent[] {
  const events: WebhookPostbackEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      // Quick reply taps arrive as messages carrying the tapped option's
      // payload; they are handled like postback button taps.
      const quickReplyPayload = ownQuickReplyPayload(messaging.message);
      const postbackPayload = messaging.postback?.payload ?? quickReplyPayload;
      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!postbackPayload || !userId || !accountId) continue;
      // Ignore echoes of the account's own actions.
      if (userId === accountId) continue;

      events.push({
        instagramAccountId: accountId,
        userId,
        payload: postbackPayload,
        mid: messaging.postback ? messaging.postback.mid : messaging.message?.mid,
      });
    }
  }

  return events;
}

/**
 * Parse inbound Instagram DMs out of a webhook payload. These drive the
 * keyword-triggered autoreply: a user messages the account, and a campaign
 * with `dmTriggerEnabled` whose keywords match the text replies to them.
 *
 * Echoes (messages the account itself sent, including our own autoreplies),
 * deletions, and attachment-only messages with no text are dropped here so
 * the worker never sees them — an echo would otherwise let an autoreply
 * containing its own keyword trigger itself.
 */
export function parseMessageEvents(
  payload: WebhookPayload
): WebhookMessageEvent[] {
  const events: WebhookMessageEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message) continue;
      if (message.is_echo || message.is_deleted || message.is_unsupported) {
        continue;
      }
      // A tap on one of our quick replies is routed as a postback above; its
      // text is just the option's title, so it must not fire keyword triggers.
      if (ownQuickReplyPayload(message)) continue;

      const text = message.text?.trim();
      const messageId = message.mid;
      const senderId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!text || !messageId || !senderId || !accountId) continue;
      // Ignore anything the connected account sent to itself.
      if (senderId === accountId) continue;

      events.push({
        instagramAccountId: accountId,
        messageId,
        messageText: text,
        senderId,
      });
    }
  }

  return events;
}

/**
 * Parse Instagram DM read receipts. When a user reads an opening DM but does
 * not tap its button, the webhook route uses this to schedule the reveal after
 * a short grace period.
 */
export function parseReadEvents(payload: WebhookPayload): WebhookReadEvent[] {
  const events: WebhookReadEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      if (!messaging.read) continue;

      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!userId || !accountId) continue;
      if (userId === accountId) continue;

      events.push({
        instagramAccountId: accountId,
        userId,
        watermark: messaging.read.watermark,
      });
    }
  }

  return events;
}
