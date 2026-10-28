import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  buildInitialCampaignLinks,
  syncCampaignLinks,
} from "@/lib/campaigns/links";
import { generateReportShareSlug } from "@/lib/reports/share";

/**
 * Campaign create, update and delete, shared by the dashboard routes
 * (app/api/automations) and the service-key API (lib/integrations). Both call
 * these functions, so a campaign is validated and stored the same way no
 * matter where the request came from. Callers handle authentication and
 * roles; every function here is scoped to the workspace it is given.
 */

// The fields a new campaign accepts. Kept apart from the rules below so the
// API can describe the same fields as a JSON schema.
export const createCampaignFields = z.object({
  name: z.string().min(1).max(100),
  goal: z.string().min(1).max(120).optional().nullable(),
  instagramAccountId: z.string().min(1).optional().nullable(),
  postId: z.string().min(1).optional().nullable(),
  postUrl: z.string().url().optional().nullable(),
  pendingNextReel: z.boolean().optional().default(false),
  matchAnyPost: z.boolean().optional().default(false),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional().default([]),
  matchAnyWord: z.boolean().optional().default(false),
  dmTriggerEnabled: z.boolean().optional().default(false),
  dmMessage: z.string().min(1).max(1000),
  openingDmEnabled: z.boolean().optional().default(false),
  openingDmMessage: z.string().max(1000).optional().nullable(),
  openingDmButtonLabel: z.string().max(64).optional().nullable(),
  linkButtonLabel: z.string().max(20).optional().nullable(),
  requireFollow: z.boolean().optional().default(false),
  followPromptMessage: z.string().max(1000).optional().nullable(),
  followPromptButtonLabel: z.string().max(20).optional().nullable(),
  followUpEnabled: z.boolean().optional().default(false),
  followUpMessage: z.string().max(1000).optional().nullable(),
  // Minutes to wait before the follow-up. Capped at 24h so it stays inside
  // Instagram's messaging window.
  followUpDelayMinutes: z.number().int().min(0).max(1440).optional().default(0),
  publicReplyEnabled: z.boolean().optional().default(false),
  publicReplyMessage: z.string().max(1000).optional().nullable(),
  publicReplyMessages: z
    .array(z.string().max(1000))
    .max(10)
    .optional()
    .default([]),
  // Empty string means "no tracked link"; a URL sets one.
  trackedDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  // Optional second tracked link, rendered as a second DM button.
  secondaryDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  secondaryButtonLabel: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  wholeWordMatch: z.boolean().optional().default(true),
});

export const createCampaignSchema = createCampaignFields
  // A campaign must target a specific post, any post, or the next reel.
  .refine(
    (d) => d.matchAnyPost || d.pendingNextReel || Boolean(d.postId),
    { message: "Choose which post(s) trigger the campaign", path: ["postId"] }
  )
  // And it must match either specific words or any word.
  .refine((d) => d.matchAnyWord || d.keywords.length >= 1, {
    message: "Add at least one keyword, or match any word",
    path: ["keywords"],
  })
  // An opening DM needs both a message and a button label.
  .refine(
    (d) =>
      !d.openingDmEnabled ||
      (Boolean(d.openingDmMessage?.trim()) &&
        Boolean(d.openingDmButtonLabel?.trim())),
    { message: "Opening DM needs a message and a button label", path: ["openingDmMessage"] }
  );

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().min(1).max(120).optional().nullable(),
  postId: z.string().min(1).optional().nullable(),
  postUrl: z.string().url().optional().nullable(),
  pendingNextReel: z.boolean().optional(),
  matchAnyPost: z.boolean().optional(),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
  matchAnyWord: z.boolean().optional(),
  dmTriggerEnabled: z.boolean().optional(),
  dmMessage: z.string().min(1).max(1000).optional(),
  openingDmEnabled: z.boolean().optional(),
  openingDmMessage: z.string().max(1000).optional().nullable(),
  openingDmButtonLabel: z.string().max(64).optional().nullable(),
  linkButtonLabel: z.string().max(20).optional().nullable(),
  requireFollow: z.boolean().optional(),
  followPromptMessage: z.string().max(1000).optional().nullable(),
  followPromptButtonLabel: z.string().max(20).optional().nullable(),
  followUpEnabled: z.boolean().optional(),
  followUpMessage: z.string().max(1000).optional().nullable(),
  followUpDelayMinutes: z.number().int().min(0).max(1440).optional(),
  publicReplyEnabled: z.boolean().optional(),
  publicReplyMessage: z.string().max(1000).optional().nullable(),
  publicReplyMessages: z.array(z.string().max(1000)).max(10).optional(),
  isActive: z.boolean().optional(),
  wholeWordMatch: z.boolean().optional(),
  reportShareEnabled: z.boolean().optional(),
  // Empty string clears the tracked link; a URL updates/creates it; undefined
  // leaves it unchanged.
  trackedDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  // Same semantics for the optional second tracked link / DM button.
  secondaryDestinationUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  secondaryButtonLabel: z.string().max(20).optional().nullable(),
});

export type CampaignResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; details?: unknown };

function invalid(error: z.ZodError) {
  return {
    ok: false as const,
    status: 400,
    error: "Invalid input",
    details: z.flattenError(error),
  };
}

const notFound = { ok: false as const, status: 404, error: "Campaign not found" };

export async function createCampaign(workspaceId: string, body: unknown) {
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const requestedInstagramAccountId =
    parsed.data.instagramAccountId && parsed.data.instagramAccountId !== "all"
      ? parsed.data.instagramAccountId
      : null;

  const [workspace, instagramAccount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    }),
    requestedInstagramAccountId
      ? prisma.instagramAccount.findFirst({
          where: { id: requestedInstagramAccountId, workspaceId },
        })
      : prisma.instagramAccount.findFirst({
          where: { workspaceId },
          orderBy: { connectedAt: "desc" },
        }),
  ]);

  if (!workspace) {
    return { ok: false as const, status: 404, error: "Workspace not found" };
  }

  if (!instagramAccount) {
    return {
      ok: false as const,
      status: 400,
      error: "Connect Instagram before creating campaigns",
    };
  }

  const linkCreates = buildInitialCampaignLinks({
    workspaceId,
    primaryUrl: parsed.data.trackedDestinationUrl,
    secondaryUrl: parsed.data.secondaryDestinationUrl,
    secondaryLabel: parsed.data.secondaryButtonLabel,
  });

  const { pendingNextReel, matchAnyPost, matchAnyWord, openingDmEnabled } =
    parsed.data;
  // A post is only stored for the "specific post" trigger.
  const isSpecificPost = !pendingNextReel && !matchAnyPost;
  const publicReplyList = (
    parsed.data.publicReplyMessages.length > 0
      ? parsed.data.publicReplyMessages
      : parsed.data.publicReplyMessage
        ? [parsed.data.publicReplyMessage]
        : []
  )
    .map((m) => m.trim())
    .filter(Boolean);

  const automation = await prisma.automation.create({
    data: {
      name: parsed.data.name,
      goal: parsed.data.goal,
      // A next-reel campaign has no post yet; the cron binds it once a reel is posted.
      postId: isSpecificPost ? parsed.data.postId : null,
      postUrl: isSpecificPost ? parsed.data.postUrl : null,
      pendingNextReel,
      matchAnyPost,
      keywords: matchAnyWord ? [] : parsed.data.keywords,
      matchAnyWord,
      dmTriggerEnabled: parsed.data.dmTriggerEnabled,
      dmMessage: parsed.data.dmMessage,
      openingDmEnabled,
      openingDmMessage: openingDmEnabled
        ? parsed.data.openingDmMessage || null
        : null,
      openingDmButtonLabel: openingDmEnabled
        ? parsed.data.openingDmButtonLabel || null
        : null,
      linkButtonLabel: parsed.data.linkButtonLabel || null,
      requireFollow: parsed.data.requireFollow,
      followPromptMessage: parsed.data.requireFollow
        ? parsed.data.followPromptMessage || null
        : null,
      followPromptButtonLabel: parsed.data.requireFollow
        ? parsed.data.followPromptButtonLabel || null
        : null,
      followUpEnabled: parsed.data.followUpEnabled,
      followUpMessage: parsed.data.followUpEnabled
        ? parsed.data.followUpMessage || null
        : null,
      followUpDelayMinutes: parsed.data.followUpEnabled
        ? parsed.data.followUpDelayMinutes
        : 0,
      publicReplyEnabled: parsed.data.publicReplyEnabled,
      publicReplyMessages: parsed.data.publicReplyEnabled
        ? publicReplyList
        : [],
      publicReplyMessage: parsed.data.publicReplyEnabled
        ? publicReplyList[0] ?? parsed.data.publicReplyMessage ?? null
        : null,
      isActive: parsed.data.isActive,
      wholeWordMatch: parsed.data.wholeWordMatch,
      workspaceId,
      instagramAccountId: instagramAccount.id,
      reportShareSlug: generateReportShareSlug(),
      ...(linkCreates.length > 0
        ? { trackedLinks: { create: linkCreates } }
        : {}),
    },
    include: {
      trackedLinks: true,
    },
  });

  return { ok: true as const, data: automation };
}

export async function updateCampaign(
  workspaceId: string,
  automationId: string,
  body: unknown
) {
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
  });

  if (!existing) return notFound;

  const {
    trackedDestinationUrl,
    secondaryDestinationUrl,
    secondaryButtonLabel,
    ...automationData
  } = parsed.data;

  // Keep dependent fields consistent: any-word clears keywords; a disabled
  // opening DM clears its message and button.
  if (automationData.matchAnyWord === true) automationData.keywords = [];
  if (automationData.openingDmEnabled === false) {
    automationData.openingDmMessage = null;
    automationData.openingDmButtonLabel = null;
  }
  if (automationData.requireFollow === false) {
    automationData.followPromptMessage = null;
    automationData.followPromptButtonLabel = null;
  }
  if (automationData.followUpEnabled === false) {
    automationData.followUpMessage = null;
    automationData.followUpDelayMinutes = 0;
  }
  // Any-post / next-reel campaigns carry no specific post.
  if (automationData.matchAnyPost === true || automationData.pendingNextReel === true) {
    automationData.postId = null;
    automationData.postUrl = null;
  }
  // Keep the public-reply variations list and the legacy single field in sync.
  if (automationData.publicReplyMessages !== undefined) {
    const list = automationData.publicReplyMessages
      .map((m) => m.trim())
      .filter(Boolean);
    automationData.publicReplyMessages = list;
    automationData.publicReplyMessage = list[0] ?? null;
  }
  if (automationData.publicReplyEnabled === false) {
    automationData.publicReplyMessages = [];
    automationData.publicReplyMessage = null;
  }

  // One transaction, so a save never lands half applied. Updating the campaign
  // first locks its row, which makes a second save of the same campaign wait
  // for this one before it reads the links.
  const updated = await prisma.$transaction(async (tx) => {
    const campaign = await tx.automation.update({
      where: { id: automationId },
      data: automationData,
    });

    await syncCampaignLinks(tx, {
      workspaceId,
      automationId,
      primaryUrl: trackedDestinationUrl,
      secondaryUrl: secondaryDestinationUrl,
      secondaryLabel: secondaryButtonLabel,
    });

    return campaign;
  });

  return { ok: true as const, data: updated };
}

export async function deleteCampaign(workspaceId: string, automationId: string) {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
  });

  if (!existing) return notFound;

  await prisma.automation.delete({ where: { id: automationId } });

  return { ok: true as const, data: { deleted: true } };
}
