import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { contentSchema } from "./schema";
import { z } from "zod";
import { buildInitialCampaignLinks } from "@/lib/campaigns/links";
import { saveCampaignRevision } from "@/lib/campaigns/mutations";
import { generateReportShareSlug } from "@/lib/reports/share";
import { ApiError } from "./http";

const draftSchema = contentSchema.extend({
  instagramAccountId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(8).max(128),
});

/** Browser library copies are snapshots, not references to a mutable resource.
 * A shared account transaction lock serializes retries without API credentials. */
export async function createLibraryDraft(context: { workspaceId: string; actorId: string }, input: unknown) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("Invalid draft content");
  const { idempotencyKey, trackedDestinationUrl, secondaryDestinationUrl, secondaryButtonLabel, ...data } = parsed.data;
  const fingerprint = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  const requestKey = createHash("sha256").update(JSON.stringify([context.actorId, idempotencyKey])).digest("hex");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.workspaceId}:${requestKey}`}, 0))`;
    const existing = await tx.libraryDraftRequest.findUnique({ where: { workspaceId_requestKey: { workspaceId: context.workspaceId, requestKey } } });
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ApiError("Idempotency key already used for different content", 409);
      const campaign = await tx.automation.findFirst({ where: { id: existing.campaignId, workspaceId: context.workspaceId }, select: { id: true } });
      if (!campaign) throw new ApiError("The previously created draft was deleted; start a new request", 409);
      return { campaignId: existing.campaignId, replayed: true };
    }
    const account = await tx.instagramAccount.findFirst({ where: { id: data.instagramAccountId, workspaceId: context.workspaceId }, select: { id: true } });
    if (!account) throw new ApiError("Instagram account not found", 404);
    const campaign = await tx.automation.create({ data: {
      ...data, workspaceId: context.workspaceId, isActive: false, lifecycle: "DRAFT", armedAt: null,
      postId: null, postUrl: null, matchAnyPost: false, pendingNextReel: false,
      reportShareSlug: generateReportShareSlug(),
      trackedLinks: { create: buildInitialCampaignLinks({ workspaceId: context.workspaceId,
        primaryUrl: trackedDestinationUrl, secondaryUrl: secondaryDestinationUrl, secondaryLabel: secondaryButtonLabel }) },
    } });
    await tx.libraryDraftRequest.create({ data: { workspaceId: context.workspaceId, requestKey, fingerprint, campaignId: campaign.id } });
    await saveCampaignRevision(tx, campaign, context.actorId);
    return { campaignId: campaign.id, replayed: false };
  });
}
