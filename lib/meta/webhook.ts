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
  platform: "instagram" | "facebook";
  socialAccountId: string;
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
      from?: {
        id?: string;
        username?: string;
        name?: string;
      };
      media?: {
        id?: string;
      };
      media_id?: string;
      // Facebook Page `feed` field only (doc confirmed 13/09): a comment
      // arrives as item="comment", verb="add", with post_id instead of
      // media_id and `message` instead of `text`.
      item?: string;
      verb?: string;
      post_id?: string;
      message?: string;
    };
  }>;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    postback?: { mid?: string; title?: string; payload?: string };
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
      reply_to?: {
        mid?: string;
        story?: { id?: string; url?: string };
      };
    };
  }>;
}

export interface WebhookPostbackEvent {
  socialAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
}

export interface WebhookStoryReplyEvent {
  socialAccountId: string;
  senderId: string;
  messageId: string;
  text: string;
  storyId?: string;
  storyUrl?: string;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export function parseCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  if (payload.object === "instagram") return parseInstagramCommentEvents(payload);
  if (payload.object === "page") return parseFacebookCommentEvents(payload);
  return [];
}

function parseInstagramCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

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

      // Skip the connected account's own comments and comment replies.
      // A private reply to yourself is rejected by Meta, so queueing one
      // only produces a failed log and wasted retries.
      if (commenterId === entry.id) {
        continue;
      }

      events.push({
        platform: "instagram",
        socialAccountId: entry.id,
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

// Facebook Page comments arrive on the `feed` field (there is no separate
// "comments" field like Instagram — doc confirmed 13/09,
// graph-api/webhooks/reference/page). `item`/`verb` narrow it down to a new
// top-level comment; edits and deletes are ignored, same as Instagram never
// re-processing an edited comment.
function parseFacebookCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;

      const value = change.value;
      if (value?.item !== "comment" || value?.verb !== "add") continue;

      const commentId = value?.comment_id ?? value?.id;
      const postId = value?.post_id;
      const commenterId = value?.from?.id;

      if (!entry.id || !commentId || !postId || !commenterId) {
        continue;
      }

      // Skip the Page's own comments (e.g. a reply the Page itself posted).
      if (commenterId === entry.id) {
        continue;
      }

      events.push({
        platform: "facebook",
        socialAccountId: entry.id,
        commentId,
        commentText: value.message ?? "",
        commenterId,
        commenterName: value.from?.name,
        mediaId: postId,
      });
    }
  }

  return events;
}

/**
 * Whether a payload carries any DM content (a `message` object in a messaging
 * event, echoes included). Such payloads must never be persisted raw: the
 * `messages` webhook field delivers every DM the account receives, and only
 * story-reply keyword matches may leave a trace (see the webhook route).
 */
export function payloadContainsMessages(payload: WebhookPayload): boolean {
  // Structural check, not Instagram-specific: a Page payload has no
  // `messaging` array today (only `feed` is subscribed for Facebook), but
  // this stays correct unconditionally if that ever changes.
  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      if (messaging.message) return true;
    }
  }

  return false;
}

/**
 * Parse story replies (a DM sent by replying to one of the account's stories)
 * out of a webhook payload. Regular DMs — no `reply_to.story` — are not
 * events; the route drops them without persisting anything.
 */
export function parseStoryReplyEvents(
  payload: WebhookPayload
): WebhookStoryReplyEvent[] {
  const events: WebhookStoryReplyEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message) continue;
      // Echoes are the account's own outbound messages.
      if (message.is_echo) continue;

      const senderId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;
      const story = message.reply_to?.story;

      if (!story || !senderId || !accountId || !message.mid) continue;
      if (senderId === accountId) continue;

      events.push({
        socialAccountId: accountId,
        senderId,
        messageId: message.mid,
        text: message.text ?? "",
        storyId: story.id,
        storyUrl: story.url,
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
        socialAccountId: accountId,
        userId,
        payload: postbackPayload,
        mid: messaging.postback?.mid,
      });
    }
  }

  return events;
}
