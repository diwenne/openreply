/**
 * Creates a campaign from generated YOYAKU copy.
 *
 * Deliberately narrower than the interactive POST /api/automations route:
 * generated campaigns are born INACTIVE (a human reviews and activates during
 * the trial period), pending a post, and carry the catno so the attach cron
 * can bind them to the exact media whose caption contains #<catno>.
 */

import { prisma } from "@/lib/db/client";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { generateReportShareSlug } from "@/lib/reports/share";
import type { CampaignCopy } from "@/lib/copy/yoyaku-patterns";

export interface GeneratedCampaignInput {
  copy: CampaignCopy;
  /** Catalogue number used for #catno post binding; null for instore. */
  catnoTag: string | null;
  workspaceId: string;
  instagramAccountId: string;
  isActive: boolean;
}

export async function createGeneratedCampaign(input: GeneratedCampaignInput) {
  const { copy, workspaceId } = input;

  const linkCreates = [
    {
      workspaceId,
      slug: generateTrackedLinkSlug(),
      label: "Primary campaign link",
      destinationUrl: copy.trackedDestinationUrl,
    },
  ];
  if (copy.secondaryDestinationUrl) {
    linkCreates.push({
      workspaceId,
      slug: generateTrackedLinkSlug(),
      label: copy.secondaryButtonLabel ?? "Open link",
      destinationUrl: copy.secondaryDestinationUrl,
    });
  }

  return prisma.automation.create({
    data: {
      name: copy.name,
      goal: copy.goal,
      postId: null,
      postUrl: null,
      pendingNextReel: true,
      catnoTag: input.catnoTag,
      matchAnyPost: false,
      keywords: [],
      matchAnyWord: true,
      dmMessage: copy.dmMessage,
      openingDmEnabled: true,
      openingDmMessage: copy.openingDmMessage,
      openingDmButtonLabel: copy.openingDmButtonLabel,
      linkButtonLabel: copy.linkButtonLabel,
      isActive: input.isActive,
      wholeWordMatch: true,
      workspaceId,
      instagramAccountId: input.instagramAccountId,
      reportShareSlug: generateReportShareSlug(),
      trackedLinks: { create: linkCreates },
    },
    include: { trackedLinks: true },
  });
}
