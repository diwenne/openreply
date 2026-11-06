import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { generateReportShareSlug } from "@/lib/reports/share";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const campaignSchema = z.object({
  postId: z.string().min(1),
  postUrl: z.string().optional().nullable(),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
  dmMessage: z.string().min(1).max(1000),
  name: z.string().max(100).optional().nullable(),
  goal: z.string().max(120).optional().nullable(),
  publicReplyMessage: z.string().max(1000).optional().nullable(),
  trackedUrl: z.string().optional().nullable(),
  wholeWordMatch: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

const importSchema = z.object({
  instagramAccountId: z.string().min(1),
  campaigns: z.array(campaignSchema).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can import campaigns" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid import data" },
      { status: 400 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    context.workspaceId,
    parsed.data.instagramAccountId
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 400 }
    );
  }

  const existing = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: { postId: true },
  });
  const usedPostIds = new Set(existing.map((a) => a.postId));

  const created: { name: string; postId: string }[] = [];
  const skipped: { row: number; reason: string }[] = [];

  let row = 0;
  for (const campaign of parsed.data.campaigns) {
    row++;
    if (usedPostIds.has(campaign.postId)) {
      skipped.push({ row, reason: "a campaign already exists for this post" });
      continue;
    }

    const validTrackedUrl =
      campaign.trackedUrl && /^https?:\/\//i.test(campaign.trackedUrl)
        ? campaign.trackedUrl
        : null;
    const name =
      (campaign.name ?? "").trim().slice(0, 100) ||
      `Imported: ${campaign.keywords[0]}`;
    const publicReply = (campaign.publicReplyMessage ?? "").trim();

    await prisma.automation.create({
      data: {
        name,
        goal: (campaign.goal ?? "").trim().slice(0, 120) || null,
        postId: campaign.postId,
        postUrl: campaign.postUrl ?? null,
        keywords: campaign.keywords,
        dmMessage: campaign.dmMessage.slice(0, 1000),
        publicReplyEnabled: Boolean(publicReply),
        publicReplyMessage: publicReply ? publicReply.slice(0, 1000) : null,
        isActive: campaign.isActive,
        wholeWordMatch: campaign.wholeWordMatch,
        workspaceId: context.workspaceId,
        instagramAccountId: account.id,
        reportShareSlug: generateReportShareSlug(),
        ...(validTrackedUrl
          ? {
              trackedLinks: {
                create: {
                  workspaceId: context.workspaceId,
                  slug: generateTrackedLinkSlug(),
                  label: "Primary campaign link",
                  destinationUrl: validTrackedUrl,
                },
              },
            }
          : {}),
      },
    });

    usedPostIds.add(campaign.postId);
    created.push({ name, postId: campaign.postId });
  }

  return NextResponse.json({
    success: true,
    data: { created, skipped },
  });
}
