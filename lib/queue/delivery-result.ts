import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

/** Publish durable stage state and the existing DmLog outcome atomically.
 * The DmLog claim remains the authoritative pre-send ambiguity guard. */
export async function recordDeliveryResult(campaign: {
  id: string; workspaceId: string; instagramAccountId: string; version: number;
}, input: {
  sourceId: string; stage: string; status: "SENT" | "FAILED" | "UNCONFIRMED";
  recipientId: string; message?: string | null; error?: string | null;
}, write: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const operationKey = deliveryOperationKey(campaign.id, input.sourceId, input.stage);
  await prisma.$transaction(async (tx) => {
    await write(tx);
    const data = {
      status: input.status, error: input.error ?? null,
      ...(input.message !== undefined ? { message: input.message } : {}),
      sentAt: input.status === "SENT" ? new Date() : null,
    };
    await tx.deliveryEvent.upsert({ where: { operationKey },
      create: { operationKey, workspaceId: campaign.workspaceId, automationId: campaign.id,
        instagramAccountId: campaign.instagramAccountId, stage: input.stage,
        campaignVersion: campaign.version, recipientId: input.recipientId, ...data },
      update: data,
    });
  });
}

export function deliveryOperationKey(campaignId: string, sourceId: string, stage: string) {
  return `delivery_${createHash("sha256").update(JSON.stringify([campaignId, sourceId, stage])).digest("hex")}`;
}
