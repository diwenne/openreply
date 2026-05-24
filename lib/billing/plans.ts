import type { Plan, SubscriptionStatus } from "@/app/generated/prisma/client";

export interface PlanLimit {
  maxAutomations: number;
  maxDMsPerMonth: number;
  maxInstagramAccounts: number;
  maxWorkspaceMembers: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimit> = {
  FREE: {
    maxAutomations: 1,
    maxDMsPerMonth: 100,
    maxInstagramAccounts: 1,
    maxWorkspaceMembers: 1,
  },
  PRO: {
    maxAutomations: 10,
    maxDMsPerMonth: 2000,
    maxInstagramAccounts: 1,
    maxWorkspaceMembers: 1,
  },
  AGENCY: {
    maxAutomations: Number.POSITIVE_INFINITY,
    maxDMsPerMonth: 10000,
    maxInstagramAccounts: 10,
    maxWorkspaceMembers: 10,
  },
};

export function getPlanForPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "FREE";
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return "AGENCY";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  return "FREE";
}

export function hasPaidAccess(status: SubscriptionStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

export function getEffectivePlan(plan: Plan, status: SubscriptionStatus): Plan {
  if (plan === "FREE") return "FREE";
  return hasPaidAccess(status) ? plan : "FREE";
}
