import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl, isTikTokConfigured } from "@/lib/env";
import { encryptToken, verifyOAuthState } from "@/lib/meta/oauth";
import {
  exchangeTikTokCode,
  getTikTokProfile,
  hasRequiredTikTokScopes,
} from "@/lib/tiktok/api";
import { canManageWorkspace } from "@/lib/workspace-access";

/**
 * TikTok redirects to /api/tiktok/callback/ (its redirect URLs must end in a
 * slash). Next.js answers that with a 308 to this route, keeping the query.
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  if (!isTikTokConfigured()) {
    return NextResponse.redirect(`${baseUrl}/settings`);
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/tiktok?tiktok=${error === "invalid_scope" ? "invalid_scope" : "denied"}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/tiktok?tiktok=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: state.workspaceId, userId: session.user.id },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/tiktok?tiktok=forbidden`);
  }

  try {
    const tokens = await exchangeTikTokCode(code);
    // The owner can untick scopes on the consent screen. Without the comment
    // scopes the connection could never reply, so refuse it here.
    if (!hasRequiredTikTokScopes(tokens.scope)) {
      return NextResponse.redirect(`${baseUrl}/tiktok?tiktok=missing_scope`);
    }

    const profile = await getTikTokProfile(tokens.accessToken, tokens.openId).catch(
      (profileError) => {
        console.warn("[TikTok Callback] Profile lookup failed:", profileError);
        return { username: null, displayName: null };
      }
    );

    const existing = await prisma.tikTokAccount.findUnique({
      where: { openId: tokens.openId },
      select: { id: true, workspaceId: true },
    });
    if (existing && existing.workspaceId !== state.workspaceId) {
      return NextResponse.redirect(`${baseUrl}/tiktok?tiktok=already_connected`);
    }

    const now = Date.now();
    const data = {
      username: profile.username ?? profile.displayName ?? tokens.openId,
      displayName: profile.displayName,
      accessToken: encryptToken(tokens.accessToken),
      tokenExpiresAt: new Date(now + tokens.expiresIn * 1000),
      refreshToken: encryptToken(tokens.refreshToken),
      refreshTokenExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
      scope: tokens.scope,
    };
    if (existing) {
      await prisma.tikTokAccount.update({ where: { id: existing.id }, data });
    } else {
      await prisma.tikTokAccount.create({
        data: { ...data, workspaceId: state.workspaceId, openId: tokens.openId },
      });
    }

    return NextResponse.redirect(`${baseUrl}/tiktok?tiktok=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[TikTok Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "TikTok connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/tiktok?tiktok=failed&reason=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
