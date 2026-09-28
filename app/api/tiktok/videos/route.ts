import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isTikTokConfigured } from "@/lib/env";
import { listTikTokVideos, TikTokApiError } from "@/lib/tiktok/api";
import { withTikTokToken } from "@/lib/tiktok/tokens";

/** One page of the account's newest videos, for the campaign video picker. */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isTikTokConfigured()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const account = await prisma.tikTokAccount.findFirst({
    where: {
      workspaceId,
      id: request.nextUrl.searchParams.get("tiktokAccountId") ?? undefined,
    },
    orderBy: { connectedAt: "desc" },
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Connect a TikTok account first." },
      { status: 400 }
    );
  }

  const cursorParam = request.nextUrl.searchParams.get("cursor");
  try {
    const result = await withTikTokToken(account, (token) =>
      listTikTokVideos(token, account.openId, {
        cursor: cursorParam ? Number(cursorParam) : undefined,
      })
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof TikTokApiError
        ? `TikTok ${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
