import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl, getMetaGraphApiVersion } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import {
  exchangeFacebookCodeForToken,
  getLongLivedUserToken,
  getUserPages,
} from "@/lib/meta/facebook-oauth";
import { encryptToken, verifyOAuthState } from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  const response = await fetch(
    `https://graph.facebook.com/${getMetaGraphApiVersion()}/${pageId}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({ subscribed_fields: ["feed", "messages"] }),
    }
  );

  const data = await response.json();
  return Boolean(data?.success);
}

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
    const { accessToken: shortLivedToken } =
      await exchangeFacebookCodeForToken(code, redirectUri);
    const { accessToken: longLivedToken } =
      await getLongLivedUserToken(shortLivedToken);
    const pages = await getUserPages(longLivedToken);

    if (pages.length === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=no_pages`);
    }

    let connectedCount = 0;

    for (const page of pages) {
      const connection = await canConnectInstagramAccount({
        workspaceId: state.workspaceId,
        instagramId: page.id,
      });

      if (!connection.allowed) continue;

      // Page tokens derived from a long-lived user token do not expire.
      const encryptedToken = encryptToken(page.access_token);

      let webhookSubscribed = false;
      try {
        webhookSubscribed = await subscribePageToWebhooks(
          page.id,
          page.access_token
        );
      } catch (subscriptionError) {
        console.warn(
          "[Facebook Callback] Webhook subscription failed:",
          subscriptionError
        );
      }

      await prisma.instagramAccount.upsert({
        where: { instagramId: page.id },
        create: {
          workspaceId: state.workspaceId,
          platform: "FACEBOOK",
          pageId: page.id,
          // Keyed off instagramId everywhere (webhook entry.id, send calls), so
          // the Page id must also live here for FACEBOOK rows.
          instagramId: page.id,
          username: page.name,
          name: page.name,
          accessToken: encryptedToken,
          tokenExpiresAt: null,
          webhookSubscribed,
        },
        update: {
          workspaceId: state.workspaceId,
          platform: "FACEBOOK",
          pageId: page.id,
          username: page.name,
          name: page.name,
          accessToken: encryptedToken,
          tokenExpiresAt: null,
          webhookSubscribed,
        },
      });

      connectedCount += 1;
    }

    if (connectedCount === 0) {
      return NextResponse.redirect(
        `${baseUrl}/settings?facebook=already_connected`
      );
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    console.error("[Facebook Callback] Error:", err);
    return NextResponse.redirect(`${baseUrl}/settings?facebook=failed`);
  }
}
