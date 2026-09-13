import { prisma } from "@/lib/db/client";

// Instagram-specific helpers, kept under this name since every caller is an
// Instagram-only route (posts, profile, conversations, the IG OAuth callback).
// Both query the shared SocialAccount table, scoped to platform: "INSTAGRAM" —
// see lib/facebook-accounts.ts for the Facebook Page equivalents.

export async function canConnectInstagramAccount({
  workspaceId,
  instagramId,
}: {
  workspaceId: string;
  instagramId: string;
}) {
  const existingAccount = await prisma.socialAccount.findUnique({
    where: { externalId: instagramId },
    select: { workspaceId: true, platform: true },
  });

  if (existingAccount && existingAccount.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: "already_connected" as const,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  socialAccountId?: string | null
) {
  if (socialAccountId && socialAccountId !== "all") {
    return prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId, platform: "INSTAGRAM" },
    });
  }

  return prisma.socialAccount.findFirst({
    where: { workspaceId, platform: "INSTAGRAM" },
    orderBy: { connectedAt: "desc" },
  });
}

