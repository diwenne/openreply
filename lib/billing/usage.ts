import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";

// Self-hosted build: usage is still counted per month so the dashboard can
// report volume, but no cap is enforced. Meta's own rate limits apply instead.
// Must stay within PostgreSQL int4 range, since dmsSentThisPeriod is an Int
// column and this value is used in a `less-than` comparison against it. Two
// billion DMs/month is effectively unlimited without overflowing the column.
const MONTHLY_DM_LIMIT = 2_000_000_000;

function getMonthStart(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function resetUsageIfNeededTx(
  tx: Prisma.TransactionClient,
  workspaceId: string
): Promise<void> {
  const now = new Date();
  const monthStart = getMonthStart(now);

  await tx.workspace.updateMany({
    where: {
      id: workspaceId,
      usagePeriodStart: { lt: monthStart },
    },
    data: {
      usagePeriodStart: monthStart,
      dmsSentThisPeriod: 0,
    },
  });
}

export async function resetUsageIfNeeded(workspaceId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await resetUsageIfNeededTx(tx, workspaceId);
  });
}

export interface WorkspaceDMReservation {
  allowed: boolean;
  reserved: boolean;
  remaining: number;
  limit: number;
  periodStart: Date | null;
}

export async function reserveWorkspaceDMSend(
  workspaceId: string
): Promise<WorkspaceDMReservation> {
  return prisma.$transaction(async (tx) => {
    await resetUsageIfNeededTx(tx, workspaceId);

    const monthStart = getMonthStart();
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        usagePeriodStart: true,
        dmsSentThisPeriod: true,
      },
    });

    if (!workspace) {
      return {
        allowed: false,
        reserved: false,
        remaining: 0,
        limit: 0,
        periodStart: null,
      };
    }

    const limit = MONTHLY_DM_LIMIT;

    if (workspace.dmsSentThisPeriod >= limit) {
      return {
        allowed: false,
        reserved: false,
        remaining: 0,
        limit,
        periodStart: workspace.usagePeriodStart,
      };
    }

    const reserved = await tx.workspace.updateMany({
      where: {
        id: workspaceId,
        usagePeriodStart: { gte: monthStart },
        dmsSentThisPeriod: { lt: limit },
      },
      data: {
        dmsSentThisPeriod: { increment: 1 },
      },
    });

    if (reserved.count === 0) {
      const current = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { dmsSentThisPeriod: true, usagePeriodStart: true },
      });

      return {
        allowed: false,
        reserved: false,
        remaining: Math.max(0, limit - (current?.dmsSentThisPeriod ?? limit)),
        limit,
        periodStart: current?.usagePeriodStart ?? workspace.usagePeriodStart,
      };
    }

    return {
      allowed: true,
      reserved: true,
      remaining: Math.max(0, limit - workspace.dmsSentThisPeriod - 1),
      limit,
      periodStart: workspace.usagePeriodStart,
    };
  });
}

export async function canSendDMForWorkspace(workspaceId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  await resetUsageIfNeeded(workspaceId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      dmsSentThisPeriod: true,
    },
  });

  if (!workspace) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  const limit = MONTHLY_DM_LIMIT;
  const remaining = Math.max(0, limit - workspace.dmsSentThisPeriod);

  return {
    allowed: workspace.dmsSentThisPeriod < limit,
    remaining,
    limit,
  };
}

export async function releaseWorkspaceDMReservation(
  workspaceId: string,
  periodStart: Date | null
) {
  if (!periodStart) {
    return { count: 0 };
  }

  return prisma.workspace.updateMany({
    where: {
      id: workspaceId,
      usagePeriodStart: periodStart,
      dmsSentThisPeriod: { gt: 0 },
    },
    data: { dmsSentThisPeriod: { decrement: 1 } },
  });
}

export async function incrementWorkspaceDMUsage(workspaceId: string) {
  return reserveWorkspaceDMSend(workspaceId);
}
