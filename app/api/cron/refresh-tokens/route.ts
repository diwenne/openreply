import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";
import { refreshLongLivedToken } from "@/lib/meta/client";
import { isTikTokConfigured } from "@/lib/env";
import { refreshTikTokAccount } from "@/lib/tiktok/tokens";

const DAYS_BEFORE_EXPIRY = 10;
// TikTok access tokens last one day and this cron runs daily, so refresh any
// that would expire before the next run. The worker also refreshes on demand.
const TIKTOK_REFRESH_WINDOW_MS = 36 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + DAYS_BEFORE_EXPIRY);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageReset = await prisma.workspace.updateMany({
    where: { usagePeriodStart: { lt: monthStart } },
    data: {
      usagePeriodStart: monthStart,
      dmsSentThisPeriod: 0,
    },
  });

  const accountsToRefresh = await prisma.instagramAccount.findMany({
    where: {
      accessToken: { not: "" },
      provider: "META",
      tokenExpiresAt: {
        not: null,
        lte: cutoffDate,
      },
    },
    select: {
      id: true,
      workspaceId: true,
      username: true,
      accessToken: true,
    },
  });

  const results: Array<{
    instagramAccountId: string;
    username: string;
    status: "refreshed" | "failed";
    error?: string;
  }> = [];

  for (const account of accountsToRefresh) {
    try {
      const currentToken = decryptToken(account.accessToken);
      const { accessToken: newToken, expiresIn } =
        await refreshLongLivedToken(currentToken);
      const encryptedToken = encryptToken(newToken);
      const newExpiry = new Date(Date.now() + expiresIn * 1000);

      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedToken,
          tokenExpiresAt: newExpiry,
        },
      });

      results.push({
        instagramAccountId: account.id,
        username: account.username,
        status: "refreshed",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      await prisma.operationalEvent.create({
        data: {
          workspaceId: account.workspaceId,
          source: "TOKEN_REFRESH",
          level: "ERROR",
          message: `Token refresh failed for @${account.username}: ${errorMessage}`,
          payload: {
            instagramAccountId: account.id,
            username: account.username,
          },
        },
      });

      results.push({
        instagramAccountId: account.id,
        username: account.username,
        status: "failed",
        error: errorMessage,
      });
    }
  }

  const tiktokResults: Array<{
    tiktokAccountId: string;
    username: string;
    status: "refreshed" | "failed";
    error?: string;
  }> = [];

  if (isTikTokConfigured()) {
    const tiktokAccounts = await prisma.tikTokAccount.findMany({
      where: {
        tokenExpiresAt: { lte: new Date(Date.now() + TIKTOK_REFRESH_WINDOW_MS) },
        refreshTokenExpiresAt: { gt: new Date() },
      },
    });

    for (const account of tiktokAccounts) {
      try {
        await refreshTikTokAccount(account);
        tiktokResults.push({
          tiktokAccountId: account.id,
          username: account.username,
          status: "refreshed",
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await prisma.operationalEvent.create({
          data: {
            workspaceId: account.workspaceId,
            source: "TOKEN_REFRESH",
            level: "ERROR",
            message: `TikTok token refresh failed for @${account.username}: ${errorMessage}`,
            payload: { tiktokAccountId: account.id, username: account.username },
          },
        });
        tiktokResults.push({
          tiktokAccountId: account.id,
          username: account.username,
          status: "failed",
          error: errorMessage,
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      totalProcessed: accountsToRefresh.length,
      workspacesReset: usageReset.count,
      results,
      tiktokResults,
    },
  });
}
