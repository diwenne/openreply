import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body.tiktokAccountId !== "string") {
    return NextResponse.json(
      { success: false, error: "tiktokAccountId is required" },
      { status: 400 }
    );
  }

  // Campaigns and reply logs for the account go with it (cascade).
  await prisma.tikTokAccount.deleteMany({
    where: { id: body.tiktokAccountId, workspaceId: context.workspaceId },
  });

  return NextResponse.json({ success: true });
}
