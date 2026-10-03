import type { Automation, Prisma } from "@/app/generated/prisma/client";
import { campaignLifecycle, type CampaignLifecycle } from "@/lib/campaigns/selection";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";

export class CampaignMutationError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function resolveLifecycle(input: { lifecycle?: CampaignLifecycle; isActive?: boolean }, existing?: { lifecycle: string; isActive: boolean }): CampaignLifecycle {
  if (input.lifecycle) return input.lifecycle;
  if (input.isActive !== undefined) return input.isActive ? "ACTIVE" : "PAUSED";
  return existing ? campaignLifecycle(existing) : "ACTIVE";
}
export async function assertNextReelAvailable(tx: Prisma.TransactionClient, accountId: string, arming: boolean, excludeId?: string) {
  // Shared with attach-next-reel; unlike a partial unique index this also works
  // with historical overlapping rows without silently changing their state.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`next-reel:${accountId}`}))`;
  if (!arming) return;
  const pending = await tx.automation.findFirst({
    where: { instagramAccountId: accountId, pendingNextReel: true, isActive: true, lifecycle: "ACTIVE", ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  if (pending) throw new CampaignMutationError(`Another campaign is already armed for the next reel: ${pending.name}. Bind it to a post or pause it first.`);
}
export async function saveCampaignRevision(tx: Prisma.TransactionClient, campaign: Automation, actorId?: string) {
  const links = await tx.trackedLink.findMany({ where: { automationId: campaign.id, workspaceId: campaign.workspaceId }, orderBy: TRACKED_LINK_ORDER, select: { position: true, label: true, destinationUrl: true } });
  await tx.campaignRevision.create({ data: { workspaceId: campaign.workspaceId, automationId: campaign.id, actorId, snapshot: JSON.parse(JSON.stringify({ ...campaign, trackedLinks: links })) as Prisma.InputJsonValue } });
}
