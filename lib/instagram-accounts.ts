import type { Plan, SubscriptionStatus } from "@/app/generated/prisma/client";
import { getEffectivePlan, PLAN_LIMITS } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/client";

export function getInstagramAccountLimit(
  plan: Plan,
  subscriptionStatus: SubscriptionStatus
) {
  return PLAN_LIMITS[getEffectivePlan(plan, subscriptionStatus)]
    .maxInstagramAccounts;
}

export async function canConnectInstagramAccount({
  workspaceId,
  plan,
  subscriptionStatus,
  instagramId,
}: {
  workspaceId: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  instagramId: string;
}) {
  const existingAccount = await prisma.instagramAccount.findUnique({
    where: { instagramId },
    select: { workspaceId: true },
  });

  if (existingAccount && existingAccount.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: "already_connected" as const,
      limit: getInstagramAccountLimit(plan, subscriptionStatus),
    };
  }

  if (existingAccount?.workspaceId === workspaceId) {
    return {
      allowed: true,
      reason: null,
      limit: getInstagramAccountLimit(plan, subscriptionStatus),
    };
  }

  const limit = getInstagramAccountLimit(plan, subscriptionStatus);
  const currentCount = await prisma.instagramAccount.count({
    where: { workspaceId },
  });

  return {
    allowed: currentCount < limit,
    reason: currentCount < limit ? null : ("plan_limit" as const),
    limit,
  };
}

export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  instagramAccountId?: string | null
) {
  if (instagramAccountId && instagramAccountId !== "all") {
    return prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
  }

  return prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
}

