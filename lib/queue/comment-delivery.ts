import { prisma } from "@/lib/db/client";
import { deliveryOperationKey } from "./delivery-result";

export const MAX_COMMENT_SEND_ATTEMPTS = 3;

// A durable, atomic claim precedes the external side effect. If the process
// crashes or the final log write fails, an uncertain send must not be repeated.
export async function claimCommentDelivery(
  automationId: string,
  commentId: string,
  leg: "dm" | "public",
  delivery?: {
    workspaceId: string; instagramAccountId: string; version: number;
    stage: string; recipientId: string; message: string | null;
  },
): Promise<boolean> {
  const claimData = {
    where: {
      automationId,
      commentId,
      ...(delivery ? { automation: { isActive: true, lifecycle: "ACTIVE" } } : {}),
      ...(leg === "dm"
        ? {
            status: { not: "SENT" as const },
            dmDeliveryUnconfirmed: false,
            attempts: { lt: MAX_COMMENT_SEND_ATTEMPTS },
          }
        : { publicReplySentAt: null, publicReplyDeliveryUnconfirmed: false }),
    },
    data:
      leg === "dm"
        ? {
            dmDeliveryUnconfirmed: true,
            attempts: { increment: 1 },
            status: "PENDING" as const,
            errorMessage: null,
          }
        : { publicReplyDeliveryUnconfirmed: true },
  };
  if (!delivery) return (await prisma.dmLog.updateMany(claimData)).count === 1;
  return prisma.$transaction(async (tx) => {
    const result = await tx.dmLog.updateMany(claimData);
    if (result.count !== 1) return false;
    const operationKey = deliveryOperationKey(automationId, commentId, delivery.stage);
    await tx.deliveryEvent.upsert({ where: { operationKey },
      create: { operationKey, workspaceId: delivery.workspaceId, automationId,
        instagramAccountId: delivery.instagramAccountId, stage: delivery.stage,
        recipientId: delivery.recipientId, message: delivery.message,
        campaignVersion: delivery.version, status: "CLAIMED", claimedAt: new Date(), attempts: 1 },
      update: { status: "CLAIMED", claimedAt: new Date(), attempts: { increment: 1 } },
    });
    return true;
  });
}
