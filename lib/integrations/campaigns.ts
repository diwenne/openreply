import { prisma } from "@/lib/db/client";
import type { DmStatus } from "@/app/generated/prisma/client";
import {
  createCampaign as createStoredCampaign,
  deleteCampaign as deleteStoredCampaign,
  updateCampaign as updateStoredCampaign,
  type CampaignResult,
} from "@/lib/campaigns/mutations";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext, getUserMedia } from "@/lib/instagram/provider";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { ApiError } from "./http";
import { requireScope, type ServiceContext } from "./auth";

const summarySelect = {
  id: true, name: true, goal: true, instagramAccountId: true, isActive: true,
  postId: true, postUrl: true, pendingNextReel: true, matchAnyPost: true,
  keywords: true, matchAnyWord: true, dmMessage: true, createdAt: true, updatedAt: true,
} as const;

export async function listCampaigns(context: ServiceContext) {
  requireScope(context, "campaigns:read");
  return prisma.automation.findMany({
    where: { workspaceId: context.workspaceId }, select: summarySelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100,
  });
}

export async function getCampaign(context: ServiceContext, id: string) {
  requireScope(context, "campaigns:read");
  const campaign = await prisma.automation.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: {
      ...summarySelect, wholeWordMatch: true, dmTriggerEnabled: true,
      openingDmEnabled: true, openingDmMessage: true, openingDmButtonLabel: true,
      linkButtonLabel: true, requireFollow: true, followPromptMessage: true,
      followPromptButtonLabel: true, followUpEnabled: true, followUpMessage: true,
      followUpDelayMinutes: true, publicReplyEnabled: true, publicReplyMessage: true,
      publicReplyMessages: true,
      trackedLinks: {
        where: { workspaceId: context.workspaceId }, orderBy: TRACKED_LINK_ORDER,
        select: { destinationUrl: true, label: true, position: true },
      },
    },
  });
  if (!campaign) throw new ApiError("Campaign not found", 404);
  const [primary, secondary] = campaign.trackedLinks;
  return {
    ...campaign, trackedDestinationUrl: primary?.destinationUrl ?? null,
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

/** Connected accounts, so a client can pick one for create_campaign. Never tokens. */
export async function listInstagramAccounts(context: ServiceContext) {
  requireScope(context, "campaigns:read");
  return prisma.instagramAccount.findMany({
    where: { workspaceId: context.workspaceId },
    select: { id: true, username: true, name: true, provider: true, connectedAt: true },
    orderBy: { connectedAt: "desc" },
  });
}

/** Recent posts and reels of a connected account, to target a campaign at one. */
export async function listPosts(context: ServiceContext, input: { instagramAccountId?: string; limit?: number }) {
  requireScope(context, "campaigns:read");
  const account = await getWorkspaceInstagramAccount(context.workspaceId, input.instagramAccountId);
  if (!account) throw new ApiError("Instagram account not found", 404);
  let media;
  try {
    media = await getUserMedia({ context: await createInstagramContext(account), limit: input.limit ?? 25 });
  } catch {
    throw new ApiError("Could not read posts from Instagram", 502);
  }
  return {
    instagramAccountId: account.id,
    username: account.username,
    posts: media.map(post => ({
      id: post.id, caption: post.caption ?? null, mediaType: post.media_type,
      isReel: post.media_product_type === "REELS", permalink: post.permalink ?? null,
      timestamp: post.timestamp, likeCount: post.like_count ?? null, commentsCount: post.comments_count ?? null,
    })),
  };
}

async function findCampaign(context: ServiceContext, id: string) {
  const campaign = await prisma.automation.findFirst({
    where: { id, workspaceId: context.workspaceId }, select: { id: true, isActive: true },
  });
  if (!campaign) throw new ApiError("Campaign not found", 404);
  return campaign;
}

/** What happened with each comment that matched a campaign, newest first. */
export async function listDmLogs(context: ServiceContext, id: string, input: { limit?: number; status?: DmStatus }) {
  requireScope(context, "campaigns:read");
  await findCampaign(context, id);
  return prisma.dmLog.findMany({
    where: { workspaceId: context.workspaceId, automationId: id, ...(input.status ? { status: input.status } : {}) },
    select: {
      id: true, commenterName: true, commentText: true, matchedKeyword: true, status: true,
      attempts: true, dmSentAt: true, errorMessage: true, publicReplySentAt: true,
      publicReplyError: true, createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: input.limit ?? 50,
  });
}

function unwrap<T>(result: CampaignResult<T>): T {
  if (!result.ok) throw new ApiError(result.error, result.status, result.details);
  return result.data;
}

/** Campaigns created with a service key always start paused. */
export async function createCampaign(context: ServiceContext, input: Record<string, unknown>) {
  requireScope(context, "campaigns:write");
  const created = unwrap(await createStoredCampaign(context.workspaceId, { ...input, isActive: false }));
  return getCampaign(context, created.id);
}

/**
 * Editing a live campaign changes what people receive right away, so it needs
 * the same permission as turning a campaign on.
 */
export async function updateCampaign(context: ServiceContext, id: string, input: Record<string, unknown>) {
  requireScope(context, "campaigns:write");
  const campaign = await findCampaign(context, id);
  if (campaign.isActive && !context.scopes.includes("campaigns:activate")) {
    throw new ApiError("This campaign is live. Pause it first, or use a key with campaigns:activate", 403);
  }
  unwrap(await updateStoredCampaign(context.workspaceId, id, input));
  return getCampaign(context, id);
}

export async function activateCampaign(context: ServiceContext, id: string) {
  requireScope(context, "campaigns:activate");
  await findCampaign(context, id);
  unwrap(await updateStoredCampaign(context.workspaceId, id, { isActive: true }));
  return getCampaign(context, id);
}

/** Pausing only ever stops messages, so either write or activate allows it. */
export async function pauseCampaign(context: ServiceContext, id: string) {
  if (!context.scopes.includes("campaigns:activate")) requireScope(context, "campaigns:write");
  await findCampaign(context, id);
  unwrap(await updateStoredCampaign(context.workspaceId, id, { isActive: false }));
  return getCampaign(context, id);
}

/** Deleting also removes the campaign's logs and links, so it must be paused first. */
export async function deleteCampaign(context: ServiceContext, id: string) {
  requireScope(context, "campaigns:write");
  const campaign = await findCampaign(context, id);
  if (campaign.isActive) throw new ApiError("Pause the campaign before deleting it", 409);
  return unwrap(await deleteStoredCampaign(context.workspaceId, id));
}
