import { createHash, randomUUID } from "node:crypto";
import * as meta from "@/lib/meta/client";
import {
  zernioRequest,
  ZernioApiError,
  ZernioDeliveryUnconfirmedError,
} from "@/lib/zernio/client";
import type { InstagramContext, ZernioContext } from "./context";
import { toMetaMessage, type BuiltMessage } from "@/lib/dm-buttons/payload";

type Button =
  | { type: "url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

async function sendZernioMessage({
  context,
  recipientId,
  commentId,
  postId,
  text,
  buttons,
}: {
  context: ZernioContext;
  recipientId?: string;
  commentId?: string;
  postId?: string;
  text: string;
  buttons?: Button[];
}) {
  const path = commentId
    ? `/inbox/comments/${encodeURIComponent(postId ?? commentId)}/${encodeURIComponent(commentId)}/private-reply`
    : `/inbox/conversations/${encodeURIComponent(recipientId!)}/messages`;
  const body = {
    accountId: context.accountId,
    message: buttons ? text.slice(0, 640) : text,
    ...(buttons ? { buttons } : {}),
  };
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        operationId: context.operationId ?? randomUUID(),
        path,
        body,
      })
    )
    .digest("hex");
  const result = await zernioRequest<{
    messageId?: string;
    data?: { messageId: string };
  }>({
    apiKey: context.apiKey,
    path,
    method: "POST",
    body,
    ...(commentId ? {} : { idempotencyKey }),
  }).catch((error: unknown) => {
    // A send may have succeeded upstream before a network/5xx failure. The
    // service releases idempotency claims on non-2xx, so do not auto-resend.
    if (error instanceof ZernioApiError && error.code >= 500)
      throw new ZernioDeliveryUnconfirmedError();
    throw error;
  });
  const messageId = result?.messageId ?? result?.data?.messageId;
  if (!messageId) throw new ZernioDeliveryUnconfirmedError();
  return {
    message_id: messageId,
    ...(recipientId ? { recipient_id: recipientId } : {}),
  };
}

function linkButtons(buttons: meta.LinkButton[]): Button[] {
  return buttons
    .slice(0, 3)
    .map(({ title, url }) => ({ type: "url", title: title.slice(0, 20), url }));
}

export async function sendPrivateReply({
  context,
  instagramAccountId,
  commentId,
  message,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  message: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReply(
      context.accessToken,
      instagramAccountId,
      commentId,
      message
    );
  return sendZernioMessage({ context, commentId, postId, text: message });
}

export async function sendPrivateReplyWithButton({
  context,
  instagramAccountId,
  commentId,
  text,
  buttonTitle,
  payload,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  text: string;
  buttonTitle: string;
  payload: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReplyWithButton(
      context.accessToken,
      instagramAccountId,
      commentId,
      text,
      buttonTitle,
      payload
    );
  return sendZernioMessage({
    context,
    commentId,
    postId,
    text: text,
    buttons: [{ type: "postback", title: buttonTitle.slice(0, 20), payload }],
  });
}

export async function sendDirectMessageWithButton({
  context,
  instagramAccountId,
  userId,
  text,
  buttonTitle,
  payload,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  text: string;
  buttonTitle: string;
  payload: string;
}) {
  if (context.provider === "META")
    return meta.sendDirectMessageWithButton(
      context.accessToken,
      instagramAccountId,
      userId,
      text,
      buttonTitle,
      payload
    );
  return sendZernioMessage({
    context,
    recipientId: userId,
    text: text,
    buttons: [{ type: "postback", title: buttonTitle.slice(0, 20), payload }],
  });
}

export async function sendPrivateReplyWithLinkButton({
  context,
  instagramAccountId,
  commentId,
  text,
  buttons,
  postId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  commentId: string;
  text: string;
  buttons: meta.LinkButton[];
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendPrivateReplyWithLinkButton(
      context.accessToken,
      instagramAccountId,
      commentId,
      text,
      buttons
    );
  return sendZernioMessage({
    context,
    commentId,
    postId,
    text: text,
    buttons: linkButtons(buttons),
  });
}

export async function sendDirectMessage({
  context,
  instagramAccountId,
  userId,
  message,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  message: string;
}) {
  if (context.provider === "META")
    return meta.sendDirectMessage(
      context.accessToken,
      instagramAccountId,
      userId,
      message
    );
  return sendZernioMessage({ context, recipientId: userId, text: message });
}

export async function sendDirectMessageWithLinkButton({
  context,
  instagramAccountId,
  userId,
  text,
  buttons,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  userId: string;
  text: string;
  buttons: meta.LinkButton[];
}) {
  if (context.provider === "META")
    return meta.sendDirectMessageWithLinkButton(
      context.accessToken,
      instagramAccountId,
      userId,
      text,
      buttons
    );
  return sendZernioMessage({
    context,
    recipientId: userId,
    text: text,
    buttons: linkButtons(buttons),
  });
}

/**
 * Send a message built by buildStageMessage, either as the private reply to a
 * comment (commentId) or as a direct message (userId). Zernio takes buttons as
 * url/postback objects; quick replies are never built for it.
 */
export async function sendBuiltMessage({
  context,
  instagramAccountId,
  message,
  commentId,
  postId,
  userId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  message: BuiltMessage;
  commentId?: string;
  postId?: string;
  userId?: string;
}) {
  if (!commentId && !userId) throw new Error("sendBuiltMessage needs a commentId or a userId");
  if (context.provider === "META")
    return meta.sendMessagePayload(
      context.accessToken,
      instagramAccountId,
      commentId ? { comment_id: commentId } : { id: userId! },
      toMetaMessage(message)
    );
  const buttons: Button[] | undefined =
    message.kind === "buttons"
      ? message.buttons.map((button) =>
          button.type === "web_url"
            ? { type: "url", title: button.title, url: button.url }
            : { type: "postback", title: button.title, payload: button.payload }
        )
      : message.kind === "quick_replies"
        ? message.quickReplies.slice(0, 3).map((reply) => ({
            type: "postback",
            title: reply.title,
            payload: reply.payload,
          }))
        : undefined;
  return sendZernioMessage({
    context,
    ...(commentId ? { commentId, postId } : { recipientId: userId }),
    text: message.text,
    buttons,
  });
}

export async function sendCommentReply({
  context,
  commentId,
  message,
  postId,
}: {
  context: InstagramContext;
  commentId: string;
  message: string;
  postId?: string;
}) {
  if (context.provider === "META")
    return meta.sendCommentReply(context.accessToken, commentId, message);
  const result = await zernioRequest<{ data: { commentId: string } }>({
    apiKey: context.apiKey,
    path: `/inbox/comments/${encodeURIComponent(postId ?? commentId)}`,
    method: "POST",
    body: { accountId: context.accountId, commentId, message },
  }).catch((error: unknown) => {
    if (error instanceof ZernioApiError && error.code >= 500) throw new ZernioDeliveryUnconfirmedError();
    throw error;
  });
  if (!result?.data?.commentId) throw new ZernioDeliveryUnconfirmedError();
  return { id: result.data.commentId };
}
