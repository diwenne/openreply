import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl, isTikTokConfigured } from "@/lib/env";
import { hasRequiredTikTokScopes } from "@/lib/tiktok/api";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isTikTokConfigured()) {
    return NextResponse.json({ success: true, data: { configured: false } });
  }

  const accounts = await prisma.tikTokAccount.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      scope: true,
      refreshTokenExpiresAt: true,
      connectedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      canManage: canManageWorkspace(context.role),
      webhookUrl: `${getBaseUrl().replace(/\/+$/, "")}/api/tiktok/webhook`,
      accounts: accounts.map(({ scope, refreshTokenExpiresAt, ...account }) => ({
        ...account,
        // Revoked in TikTok, refresh token expired (yearly), or comment
        // scopes unticked: the owner has to connect again.
        needsReconnect:
          refreshTokenExpiresAt.getTime() <= Date.now() ||
          !hasRequiredTikTokScopes(scope),
      })),
    },
  });
}
