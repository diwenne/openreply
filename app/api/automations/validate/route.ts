import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { campaignActivationErrors, selectAutomation } from "@/lib/campaigns/selection";
import { renderMessageWithTracking, renderMessageWithoutLink } from "@/lib/tracking/message";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { httpUrl } from "@/lib/library/schema";
import { ApiError, checkOrigin, readJson } from "@/lib/library/http";

const schema = z.object({
  instagramAccountId: z.string().min(1),
  kind: z.enum(["comment", "dm"]).default("comment"), text: z.string().max(2000),
  mediaId: z.string().max(200).optional(), username: z.string().max(100).default("test-user"),
  candidate: z.object({
    id: z.string().optional(), name: z.string().max(100).default("Unsaved draft"),
    postId: z.string().nullish(), matchAnyPost: z.boolean().default(false), pendingNextReel: z.boolean().default(false),
    keywords: z.array(z.string().max(50)).max(10).default([]), excludedKeywords: z.array(z.string().max(50)).max(10).default([]),
    matchAnyWord: z.boolean().default(false), wholeWordMatch: z.boolean().default(true), dmTriggerEnabled: z.boolean().default(false),
    priority: z.number().int().min(-1000).max(1000).default(0), dmMessage: z.string().max(1000).default(""),
    openingDmEnabled: z.boolean().default(false), openingDmMessage: z.string().max(1000).nullish(), openingDmButtonLabel: z.string().max(64).nullish(),
    requireFollow: z.boolean().default(false), followPromptMessage: z.string().max(1000).nullish(),
    followUpEnabled: z.boolean().default(false), followUpMessage: z.string().max(1000).nullish(),
    publicReplyEnabled: z.boolean().default(false), publicReplyMessage: z.string().max(1000).nullish(), publicReplyMessages: z.array(z.string().max(1000)).max(10).default([]),
    trackedDestinationUrl: z.union([httpUrl, z.literal("")]).nullish(),
    secondaryDestinationUrl: z.union([httpUrl, z.literal("")]).nullish(),
    linkButtonLabel: z.string().max(20).nullish(), secondaryButtonLabel: z.string().max(20).nullish(),
  }).optional(),
});

/** Static rule/render simulation only. Does not enqueue or call any provider. */
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { checkOrigin(request); body = await readJson(request); }
  catch (error) {
    return NextResponse.json({ success: false, error: error instanceof ApiError ? error.message : "Invalid input" },
      { status: error instanceof ApiError ? error.status : 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid simulation input" }, { status: 400 });
  const input = parsed.data;
  const account = await prisma.instagramAccount.findFirst({ where: { id: input.instagramAccountId, workspaceId }, select: { id: true } });
  if (!account) return NextResponse.json({ success: false, error: "Instagram account not found" }, { status: 404 });
  const existing = await prisma.automation.findMany({ where: { workspaceId, instagramAccountId: account.id }, include: { trackedLinks: { orderBy: TRACKED_LINK_ORDER } } });
  const original = input.candidate?.id ? existing.find((a) => a.id === input.candidate?.id) : undefined;
  if (input.candidate?.id && !original) return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  const candidate = input.candidate ? {
    ...input.candidate, id: input.candidate.id ?? "__draft__", isActive: true, lifecycle: "ACTIVE",
    createdAt: original?.createdAt ?? new Date(),
    // Keep a saved tracking slug only if its destination is unchanged.
    trackedLinks: input.candidate.trackedDestinationUrl !== undefined && input.candidate.trackedDestinationUrl !== original?.trackedLinks[0]?.destinationUrl ? [] : original?.trackedLinks ?? [],
  } : undefined;
  const campaigns = candidate ? [...existing.filter((a) => a.id !== candidate.id), candidate] : existing;
  const selection = selectAutomation(campaigns, { kind: input.kind, text: input.text, mediaIds: input.mediaId ? [input.mediaId] : [] });
  const winner = selection.winner;
  // Saved campaigns use the same tracking renderer as the worker. An unsaved
  // draft cannot have a real tracking URL yet; never invent one.
  let message = winner ? renderMessageWithTracking({ message: winner.dmMessage, commenterName: input.username, trackedLinks: winner.trackedLinks }) : null;
  const candidateNeedsPreviewLink = Boolean(candidate && winner?.id === candidate.id && !candidate.trackedLinks.length);
  if (message && candidateNeedsPreviewLink && input.candidate?.trackedDestinationUrl) {
    message = message.replace(/\{link\}/gi, input.candidate.trackedDestinationUrl);
  }
  const buttonLinks = winner ? winner.id === candidate?.id ? [
    { label: input.candidate?.linkButtonLabel || "Open link", destinationUrl: input.candidate?.trackedDestinationUrl ?? original?.trackedLinks[0]?.destinationUrl },
    { label: input.candidate?.secondaryButtonLabel || "Open link", destinationUrl: input.candidate?.secondaryDestinationUrl ?? original?.trackedLinks[1]?.destinationUrl },
  ].filter((link) => Boolean(link.destinationUrl)) : winner.trackedLinks.map((link, index) => ({ label: index === 0 ? "Open link" : link.label || "Open link", destinationUrl: link.destinationUrl })) : [];
  return NextResponse.json({ success: true, data: {
    errors: candidate ? campaignActivationErrors(candidate) : [],
    winner: winner ? { id: winner.id, name: winner.name, matchedKeyword: selection.matchedKeyword } : null,
    matches: selection.matches.map((a) => ({ id: a.id, name: a.name })),
    conflicts: selection.conflicts.map((a) => ({ id: a.id, name: a.name })),
    message, buttonLinks, buttonMessage: winner ? renderMessageWithoutLink({ message: winner.dmMessage, commenterName: input.username }) : null,
    openingMessage: winner?.openingDmEnabled ? renderMessageWithoutLink({ message: winner.openingDmMessage ?? "", commenterName: input.username }) : null,
    followGate: Boolean(winner?.requireFollow),
    followMessage: winner?.requireFollow && winner.followPromptMessage ? renderMessageWithoutLink({ message: winner.followPromptMessage, commenterName: input.username }) : null,
    followUpMessage: winner?.followUpEnabled && winner.followUpMessage ? renderMessageWithoutLink({ message: winner.followUpMessage, commenterName: input.username }) : null,
    warnings: [candidate?.pendingNextReel ? "This campaign will only match after its next reel is bound." : null, candidateNeedsPreviewLink && /\{link\}/i.test(candidate!.dmMessage) ? "Preview uses the proposed destination, not a live tracking URL. Save first to create or update tracking links." : null, "Simulation checks local rules only, not Instagram permission or delivery."].filter(Boolean),
  } });
}
