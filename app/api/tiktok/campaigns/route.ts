import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { createTikTokCampaignSchema } from "@/lib/tiktok/campaigns";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const [campaigns, replied] = await Promise.all([
    prisma.tikTokCampaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { tiktokAccount: { select: { username: true } } },
    }),
    prisma.tikTokReplyLog.groupBy({
      by: ["campaignId"],
      where: { workspaceId, status: "REPLIED" },
      _count: { _all: true },
    }),
  ]);
  const repliedByCampaign = new Map(
    replied.map((row) => [row.campaignId, row._count._all])
  );

  return NextResponse.json({
    success: true,
    data: campaigns.map((campaign) => ({
      ...campaign,
      repliedCount: repliedByCampaign.get(campaign.id) ?? 0,
    })),
  });
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can manage campaigns" },
      { status: 403 }
    );
  }

  const parsed = createTikTokCampaignSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid campaign" },
      { status: 400 }
    );
  }

  const account = await prisma.tikTokAccount.findFirst({
    where: { id: parsed.data.tiktokAccountId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "TikTok account not found" },
      { status: 404 }
    );
  }

  const { videoId, matchAnyVideo, ...rest } = parsed.data;
  const campaign = await prisma.tikTokCampaign.create({
    data: {
      ...rest,
      matchAnyVideo,
      videoId: matchAnyVideo ? null : videoId,
      videoCaption: matchAnyVideo ? null : rest.videoCaption,
      workspaceId: context.workspaceId,
    },
  });

  return NextResponse.json({ success: true, data: campaign }, { status: 201 });
}
