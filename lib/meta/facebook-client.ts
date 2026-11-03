import { getMetaGraphApiVersion } from "@/lib/env";
import { handleResponse, MetaApiError } from "@/lib/meta/client";

// Messenger Send API adapter. Mirrors the Instagram send functions in
// client.ts, but POSTs to the Facebook graph host against a Page id.
// MetaApiError is re-exported so callers can catch Messenger failures
// without also importing from client.ts.
export { MetaApiError };

function facebookGraphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

export async function sendMessengerPrivateReply(
  accessToken: string,
  pageId: string,
  commentId: string,
  message: string
): Promise<{ recipient_id: string; message_id: string }> {
  const response = await fetch(`${facebookGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
    }),
  });

  return handleResponse(response);
}

export async function sendMessengerPrivateReplyWithLinkButton(
  accessToken: string,
  pageId: string,
  commentId: string,
  text: string,
  buttonTitle: string,
  url: string
): Promise<{ recipient_id: string; message_id: string }> {
  const response = await fetch(`${facebookGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: text.slice(0, 640),
            buttons: [{ type: "web_url", url, title: buttonTitle.slice(0, 20) }],
          },
        },
      },
    }),
  });

  return handleResponse(response);
}

export async function sendMessengerDirectMessage(
  accessToken: string,
  pageId: string,
  userId: string,
  message: string
): Promise<{ recipient_id: string; message_id: string }> {
  const response = await fetch(`${facebookGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: userId },
      message: { text: message },
    }),
  });

  return handleResponse(response);
}

export async function sendMessengerDirectMessageWithLinkButton(
  accessToken: string,
  pageId: string,
  userId: string,
  text: string,
  buttonTitle: string,
  url: string
): Promise<{ recipient_id: string; message_id: string }> {
  const response = await fetch(`${facebookGraphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: userId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: text.slice(0, 640),
            buttons: [{ type: "web_url", url, title: buttonTitle.slice(0, 20) }],
          },
        },
      },
    }),
  });

  return handleResponse(response);
}

export async function sendFacebookCommentReply(
  accessToken: string,
  commentId: string,
  message: string
): Promise<{ id: string }> {
  const response = await fetch(`${facebookGraphBase()}/${commentId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  return handleResponse(response);
}
