import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { contentSchema, httpUrl } from "@/lib/library/schema";
import { buildInitialCampaignLinks } from "@/lib/campaigns/links";
import { saveCampaignRevision } from "@/lib/campaigns/mutations";
import { generateReportShareSlug } from "@/lib/reports/share";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { ApiError } from "./http";
import { requireScope, type ServiceContext } from "./auth";

export const draftSchema = contentSchema.extend({
  instagramAccountId: z.string().min(1).max(100),
  postId: z.string().max(100).nullable().optional(),
  postUrl: httpUrl.nullable().optional(),
  matchAnyPost: z.boolean().default(false),
  pendingNextReel: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(128),
});

const safeCampaignSelect = {
  id: true, name: true, goal: true, instagramAccountId: true, lifecycle: true,
  isActive: true, postId: true, postUrl: true, pendingNextReel: true, matchAnyPost: true,
  keywords: true, excludedKeywords: true, matchAnyWord: true, priority: true,
  dmMessage: true, createdAt: true, updatedAt: true,
} as const;

export async function listCampaigns(context: ServiceContext) {
  requireScope(context, "campaigns:read");
  return prisma.automation.findMany({ where: { workspaceId: context.workspaceId },
    select: safeCampaignSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100 });
}

export async function getCampaign(context: ServiceContext, id: string) {
  requireScope(context, "campaigns:read");
  const campaign = await prisma.automation.findFirst({ where: { id, workspaceId: context.workspaceId },
    select: {
      ...safeCampaignSelect,
      version: true, wholeWordMatch: true, dmTriggerEnabled: true,
      openingDmEnabled: true, openingDmMessage: true, openingDmButtonLabel: true,
      linkButtonLabel: true, requireFollow: true, followPromptMessage: true,
      followPromptButtonLabel: true, followUpEnabled: true, followUpMessage: true,
      followUpDelayMinutes: true, publicReplyEnabled: true, publicReplyMessage: true,
      publicReplyMessages: true,
      trackedLinks: {
        where: { workspaceId: context.workspaceId }, orderBy: TRACKED_LINK_ORDER,
        select: { destinationUrl: true, label: true, position: true },
      },
    } });
  if (!campaign) throw new ApiError("Campaign not found", 404);
  // Match the worker's ordered-button semantics, including legacy position ties.
  const [primary, secondary] = campaign.trackedLinks;
  return { ...campaign,
    trackedDestinationUrl: primary?.destinationUrl ?? null,
    secondaryDestinationUrl: secondary?.destinationUrl ?? null,
    secondaryButtonLabel: secondary?.label ?? null,
  };
}

export async function getCampaignStats(context: ServiceContext, id: string) {
  await getCampaign(context, id);
  const [statuses, rawClicks] = await Promise.all([
    prisma.dmLog.groupBy({ by: ["status"], where: { workspaceId: context.workspaceId, automationId: id }, _count: { _all: true } }),
    prisma.linkClick.count({ where: { workspaceId: context.workspaceId, automationId: id } }),
  ]);
  return { campaignId: id, statuses, rawClicks, note: "Raw link requests include previews and repeated clicks; not unique recipients." };
}

/** Advisory lock + immutable event form one transaction: retry cannot create a second draft. */
export async function createDraft(context: ServiceContext, input: unknown) {
  requireScope(context, "drafts:write");
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
  const { idempotencyKey, trackedDestinationUrl, secondaryDestinationUrl, secondaryButtonLabel, ...data } = parsed.data;
  const fingerprint = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  const externalId = `draft:${idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.workspaceId}:${externalId}`}, 0))`;
    const existing = await tx.integrationEvent.findUnique({ where: { workspaceId_externalId: { workspaceId: context.workspaceId, externalId } } });
    if (existing) {
      const payload = existing.payload as { fingerprint: string; campaignId: string };
      if (payload.fingerprint !== fingerprint) throw new ApiError("Idempotency key already used for different content", 409);
      const campaign = await tx.automation.findFirst({ where: { id: payload.campaignId, workspaceId: context.workspaceId }, select: { id: true } });
      if (!campaign) throw new ApiError("The original draft was deleted; use a new idempotency key", 409);
      return { campaignId: payload.campaignId, replayed: true };
    }
    const account = await tx.instagramAccount.findFirst({ where: { id: data.instagramAccountId, workspaceId: context.workspaceId } });
    if (!account) throw new ApiError("Instagram account not found", 404);
    const campaign = await tx.automation.create({ data: {
      ...data, workspaceId: context.workspaceId, isActive: false, lifecycle: "DRAFT", armedAt: null,
      reportShareSlug: generateReportShareSlug(),
      trackedLinks: { create: buildInitialCampaignLinks({ workspaceId: context.workspaceId, primaryUrl: trackedDestinationUrl,
        secondaryUrl: secondaryDestinationUrl, secondaryLabel: secondaryButtonLabel }) },
    } });
    await tx.integrationEvent.create({ data: { workspaceId: context.workspaceId, automationId: campaign.id,
      externalId, eventType: "campaign.draft_created", payload: { campaignId: campaign.id, fingerprint } } });
    await saveCampaignRevision(tx, campaign, context.keyId);
    return { campaignId: campaign.id, replayed: false };
  });
}
