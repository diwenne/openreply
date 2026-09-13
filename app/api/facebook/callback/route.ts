import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { listFacebookPages, subscribeFacebookPageToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeFacebookCodeForToken,
  getLongLivedFacebookUserToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/facebook/callback`;
    const { accessToken: shortLivedUserToken } = await exchangeFacebookCodeForToken(
      code,
      redirectUri
    );
    // A Page token derived from a SHORT-lived user token inherits its ~1-2h
    // expiry; derived from a LONG-lived one it effectively never expires —
    // this exchange is what makes every connected Page token permanent.
    const { accessToken: longLivedUserToken } =
      await getLongLivedFacebookUserToken(shortLivedUserToken);

    const pages = await listFacebookPages(longLivedUserToken);
    if (pages.length === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=no_pages`);
    }

    // A Facebook user can manage several Pages; connect every one they
    // granted access to rather than forcing a picker in this pass — each
    // becomes its own SocialAccount row, selectable like any Instagram one.
    let connectedCount = 0;
    for (const page of pages) {
      const existing = await prisma.socialAccount.findUnique({
        where: { externalId: page.id },
        select: { workspaceId: true },
      });
      if (existing && existing.workspaceId !== state.workspaceId) {
        // Already connected to a different workspace — skip, don't steal it.
        continue;
      }

      const encryptedToken = encryptToken(page.access_token);

      let webhookSubscribed = false;
      try {
        const subscription = await subscribeFacebookPageToWebhooks(
          page.id,
          page.access_token
        );
        webhookSubscribed = Boolean(subscription.success);
      } catch (subscriptionError) {
        console.warn(
          "[Facebook Callback] Webhook subscription failed:",
          subscriptionError
        );
      }

      await prisma.socialAccount.upsert({
        where: { externalId: page.id },
        create: {
          workspaceId: state.workspaceId,
          platform: "FACEBOOK",
          externalId: page.id,
          username: null,
          name: page.name,
          accessToken: encryptedToken,
          // No expiry: a Page token derived from a long-lived user token is
          // permanent (see getLongLivedFacebookUserToken) — never populated
          // here, so the refresh-tokens cron (Instagram-only) leaves it alone.
          tokenExpiresAt: null,
          webhookSubscribed,
        },
        update: {
          workspaceId: state.workspaceId,
          name: page.name,
          accessToken: encryptedToken,
          webhookSubscribed,
        },
      });
      connectedCount += 1;
    }

    if (connectedCount === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=already_connected`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    console.error("[Facebook Callback] Error:", err);
    return NextResponse.redirect(`${baseUrl}/settings?facebook=failed`);
  }
}
