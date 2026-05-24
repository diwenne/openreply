import { randomBytes } from "node:crypto";
import type { Plan, SubscriptionStatus } from "@/app/generated/prisma/client";
import { getEffectivePlan } from "@/lib/billing/plans";

export function generateReportShareSlug() {
  return randomBytes(9).toString("base64url");
}

export function buildReportUrl(slug: string, baseUrl?: string) {
  const resolvedBaseUrl =
    baseUrl ??
    (typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXTAUTH_URL ?? "http://localhost:3000");

  return `${resolvedBaseUrl.replace(/\/$/, "")}/reports/${slug}`;
}

export function isReportBranded(
  plan: Plan,
  subscriptionStatus: SubscriptionStatus
) {
  return getEffectivePlan(plan, subscriptionStatus) === "FREE";
}
