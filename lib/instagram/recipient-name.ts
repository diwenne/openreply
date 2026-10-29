import { prisma } from "@/lib/db/client";
import type { InstagramContext } from "./context";
import { getRecipientUsername } from "./read-analytics";

/**
 * The name to render `{username}` with for someone reached by DM or by a
 * button tap. Those two webhooks carry only the sender's IGSID, so the handle
 * has to be recovered.
 *
 * A stored name is preferred, since it costs no API call, and only rows that
 * actually have one count: a row saved on an earlier nameless send would
 * otherwise be taken as the answer and keep the fallback in place for good.
 * The newest row wins, so a changed handle is picked up. Failing that, the
 * handle is read live, which happens on first contact.
 *
 * The search covers the workspace rather than one campaign, because an IGSID
 * is the same person across that workspace's campaigns. It stops at the
 * workspace so a name never crosses between workspaces on a shared instance.
 */
export async function resolveRecipientName({
  context,
  workspaceId,
  recipientId,
}: {
  context: InstagramContext;
  workspaceId: string;
  recipientId: string;
}): Promise<string | null> {
  const named = await prisma.dmLog.findFirst({
    where: {
      workspaceId,
      commenterId: recipientId,
      commenterName: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { commenterName: true },
  });
  if (named?.commenterName) return named.commenterName;

  return getRecipientUsername({ context, recipientId });
}
