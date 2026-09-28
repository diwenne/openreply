import { NextResponse } from "next/server";
import { getBaseUrl, isTikTokConfigured } from "@/lib/env";
import { subscribeTikTokCommentWebhook, TikTokApiError } from "@/lib/tiktok/api";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

/**
 * Point the TikTok app's COMMENT webhook at this instance. The subscription
 * belongs to the developer app, not to one account, so running it again only
 * re-registers the same URL.
 */
export async function POST() {
  if (!isTikTokConfigured()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can change the TikTok webhook" },
      { status: 403 }
    );
  }

  const callbackUrl = `${getBaseUrl().replace(/\/+$/, "")}/api/tiktok/webhook`;
  try {
    await subscribeTikTokCommentWebhook(callbackUrl);
    return NextResponse.json({ success: true, data: { callbackUrl } });
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
