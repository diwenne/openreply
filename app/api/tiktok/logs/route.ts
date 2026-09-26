import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** The 50 most recent TikTok reply attempts. */
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const logs = await prisma.tikTokReplyLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      commentText: true,
      commenterName: true,
      status: true,
      replyText: true,
      errorMessage: true,
      createdAt: true,
      campaign: { select: { name: true } },
      tiktokAccount: { select: { username: true } },
    },
  });

  return NextResponse.json({ success: true, data: logs });
}
