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

export interface WebhookCommentEvent {
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
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
      // Present when the comment is a reply to another comment. Instagram only
      // allows a private reply to a top-level comment, so a reply must be skipped.
      parent_id?: string;
      from?: {
        id?: string;
        username?: string;
      };
      media?: {
        id?: string;
      };
      media_id?: string;
    };
  }>;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    postback?: { mid?: string; title?: string; payload?: string };
  }>;
}

export interface WebhookPostbackEvent {
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

// Facebook Page "feed" webhooks carry a differently-shaped change.value than
// the Instagram "comments" webhooks above, so model it separately rather than
// widening WebhookEntry.
interface FacebookFeedChange {
  field: string;
  value?: {
    item?: string;
    verb?: string;
    comment_id?: string;
    post_id?: string;
    message?: string;
    // Set when the comment is a reply to another comment; private replies are
    // only valid on top-level comments.
    parent_id?: string;
    from?: {
      id?: string;
      name?: string;
    };
  };
}

interface FacebookPageEntry {
  id: string;
  time?: number;
  changes?: FacebookFeedChange[];
}

interface FacebookPagePayload {
  object: string;
  entry: FacebookPageEntry[];
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
      const commenterId = value?.from?.id;

      if (!entry.id || !commentId || !mediaId || !commenterId) {
        continue;
      }

      // Skip the connected account's own comments. A private reply to yourself
      // is rejected by Meta, so queueing one only produces a failed log and
      // wasted retries.
      if (commenterId === entry.id) {
        continue;
      }

      // Skip replies to another comment. Instagram allows a private reply only
      // to a top-level comment; a reply-to-a-reply returns Meta error 100
      // ("The comment is invalid for a private reply"), so queueing one only
      // produces a failed log and wasted retries.
      if (value.parent_id) {
        continue;
      }

      events.push({
        instagramAccountId: entry.id,
        commentId,
        commentText: value.text ?? "",
        commenterId,
        commenterName: value.from?.username,
        mediaId,
      });
    }
  }

  return events;
}

/**
 * Parse Facebook Page comment ("feed") webhooks into the same
 * WebhookCommentEvent shape as the Instagram parser, so the queue and worker
 * stay source-agnostic. Page feed events use object === "page" and
 * entry.id = the Page id.
 */
export function parseFacebookCommentEvents(
  payload: FacebookPagePayload
): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  if (payload.object !== "page") return events;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;

      const value = change.value;
      if (value?.item !== "comment" || value?.verb !== "add") continue;

      const commentId = value.comment_id;
      const commenterId = value.from?.id;

      if (!entry.id || !commentId || !commenterId) continue;

      // Skip the Page's own comments — a private reply to yourself is rejected
      // by Meta, so queueing one only produces a failed log and wasted retries.
      if (commenterId === entry.id) continue;

      // Skip replies to another comment — private replies are only valid on
      // top-level comments (Meta error 100 otherwise).
      if (value.parent_id) continue;

      events.push({
        instagramAccountId: entry.id,
        commentId,
        commentText: value.message ?? "",
        commenterId,
        commenterName: value.from?.name,
        mediaId: value.post_id ?? "",
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
      const postbackPayload = messaging.postback?.payload;
      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!postbackPayload || !userId || !accountId) continue;
      // Ignore echoes of the account's own actions.
      if (userId === accountId) continue;

      events.push({
        instagramAccountId: accountId,
        userId,
        payload: postbackPayload,
        mid: messaging.postback?.mid,
      });
    }
  }

  return events;
}
