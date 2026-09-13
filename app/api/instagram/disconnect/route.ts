import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

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
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const socialAccountId =
    typeof body.socialAccountId === "string" ? body.socialAccountId : null;

  await prisma.socialAccount.deleteMany({
    where: {
      workspaceId: context.workspaceId,
      ...(socialAccountId ? { id: socialAccountId } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
