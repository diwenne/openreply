import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { updateTikTokCampaignSchema } from "@/lib/tiktok/campaigns";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

type RouteProps = { params: Promise<{ id: string }> };

async function requireManager() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return {
      error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!canManageWorkspace(context.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Only owners and admins can manage campaigns" },
        { status: 403 }
      ),
    };
  }
  return { context };
}

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { context, error } = await requireManager();
  if (error) return error;
  const { id } = await params;

  const parsed = updateTikTokCampaignSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid campaign" },
      { status: 400 }
    );
  }

  const existing = await prisma.tikTokCampaign.findFirst({
    where: { id, workspaceId: context.workspaceId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  }

  // Re-check the rules that span fields against the merged result.
  const next = { ...existing, ...parsed.data };
  if (!next.matchAnyVideo && !next.videoId) {
    return NextResponse.json(
      { success: false, error: "Choose a video, or all videos" },
      { status: 400 }
    );
  }
  if (!next.matchAnyWord && next.keywords.length === 0) {
    return NextResponse.json(
      { success: false, error: "Add at least one keyword, or match any word" },
      { status: 400 }
    );
  }

  const campaign = await prisma.tikTokCampaign.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(next.matchAnyVideo ? { videoId: null, videoCaption: null } : {}),
    },
  });
  return NextResponse.json({ success: true, data: campaign });
}

export async function DELETE(_request: NextRequest, { params }: RouteProps) {
  const { context, error } = await requireManager();
  if (error) return error;
  const { id } = await params;

  await prisma.tikTokCampaign.deleteMany({
    where: { id, workspaceId: context.workspaceId },
  });
  return NextResponse.json({ success: true });
}
