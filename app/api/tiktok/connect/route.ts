import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl, getMissingTikTokOAuthEnv, isTikTokConfigured } from "@/lib/env";
import { createOAuthState } from "@/lib/meta/oauth";
import { getTikTokAuthorizationUrl } from "@/lib/tiktok/api";

export async function GET() {
  if (!isTikTokConfigured()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.redirect(`${getBaseUrl()}/login`);
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/tiktok?tiktok=forbidden`);
  }

  const missingEnv = getMissingTikTokOAuthEnv();
  if (missingEnv.length > 0) {
    return NextResponse.redirect(
      `${getBaseUrl()}/tiktok?tiktok=misconfigured&missing=${encodeURIComponent(
        missingEnv.join(",")
      )}`
    );
  }

  // Same signed, 10-minute state as the Instagram flow.
  return NextResponse.redirect(
    getTikTokAuthorizationUrl(createOAuthState(context.workspaceId))
  );
}
