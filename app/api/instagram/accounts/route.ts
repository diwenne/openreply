import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * The workspace's connected Instagram accounts — just enough for an account
 * selector. This is a single indexed query, unlike /api/dashboard/stats which
 * runs the full analytics aggregation. Pages that only need the account list
 * (e.g. the inbox) should use this so they aren't gated on heavy stats.
 */
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Instagram only — this list feeds the inbox's account picker, and the
  // inbox's conversations API (getConversations/sendDirectMessage) is an
  // Instagram-only surface. Showing a Facebook Page here would be a dead end:
  // picking it would 400 on every request.
  const instagramAccounts = await prisma.socialAccount.findMany({
    where: { workspaceId, platform: "INSTAGRAM" },
    orderBy: { connectedAt: "desc" },
    select: { id: true, username: true, externalId: true, platform: true, name: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      instagramAccounts,
      selectedInstagramAccountId: instagramAccounts[0]?.id ?? null,
    },
  });
}
