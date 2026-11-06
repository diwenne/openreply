import * as meta from "@/lib/meta/client";
import { zernioRequest } from "@/lib/zernio/client";
import type { InstagramContext } from "./context";

export async function getConversations({
  context,
  igUserId,
}: {
  context: InstagramContext;
  igUserId: string;
}): Promise<meta.InstagramConversation[]> {
  if (context.provider === "META")
    return meta.getConversations(context.accessToken, igUserId);
  const result = await zernioRequest<{
    data: {
      id: string;
      participantId?: string;
      participantUsername?: string;
      updatedTime: string;
      lastMessage: string;
    }[];
  }>({
    apiKey: context.apiKey,
    path: `/inbox/conversations?accountId=${encodeURIComponent(context.accountId)}&limit=50`,
  });
  // The list has no sender for lastMessage. Leave the optional preview absent
  // rather than attribute it to the wrong person or fetch every full thread.
  return result.data.map((c) => ({
    id: c.id,
    updated_time: c.updatedTime,
    participants: {
      data: c.participantId
        ? [
            { id: c.participantId, username: c.participantUsername },
            { id: igUserId },
          ]
        : [],
    },
  }));
}

export async function getConversationMessages({
  context,
  conversationId,
}: {
  context: InstagramContext;
  conversationId: string;
}): Promise<meta.InstagramMessage[]> {
  if (context.provider === "META")
    return meta.getConversationMessages(context.accessToken, conversationId);
  const result = await zernioRequest<{
    messages: {
      id: string;
      message: string;
      senderId?: string;
      direction: string;
      createdAt?: string;
    }[];
  }>({
    apiKey: context.apiKey,
    path: `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?accountId=${encodeURIComponent(context.accountId)}&limit=20&sortOrder=desc`,
  });
  return result.messages.map((m) => ({
    id: m.id,
    message: m.message,
    created_time: m.createdAt,
    from:
      m.direction === "outgoing"
        ? { id: context.instagramId }
        : m.senderId
          ? { id: m.senderId }
          : undefined,
  }));
}
