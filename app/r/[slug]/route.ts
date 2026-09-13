import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRequestIp, hashClickIp } from "@/lib/tracking/server";
import { isValidTrackingSrc } from "@/lib/tracking/message";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Forward the per-post attribution token onto the destination.
 *
 * Only `src` is carried over, and only when it already matches the whitelist
 * the destination enforces — every other query parameter on the short link is
 * dropped, so a crafted `/r/<slug>?utm_...&redirect=...` can never smuggle
 * anything into the destination URL. `URL.searchParams.set` merges cleanly
 * with a destinationUrl that already has a query string, and replaces a `src`
 * the destination hardcoded rather than duplicating it.
 */
function buildDestination(destinationUrl: string, src: string | null) {
  if (!src) return destinationUrl;

  try {
    const url = new URL(destinationUrl);
    url.searchParams.set("src", src);
    return url.toString();
  } catch {
    // Unparseable destination: redirect exactly as before rather than fail.
    return destinationUrl;
  }
}

export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;

  // Read from request.url (not request.nextUrl) so the handler works for any
  // Request, including the plain ones used in tests.
  const rawSrc = new URL(request.url).searchParams.get("src");
  const src = isValidTrackingSrc(rawSrc) ? rawSrc : null;

  const trackedLink = await prisma.trackedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      workspaceId: true,
      automationId: true,
      destinationUrl: true,
      automation: {
        select: {
          socialAccountId: true,
        },
      },
    },
  });

  if (!trackedLink) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  await prisma.linkClick.create({
    data: {
      workspaceId: trackedLink.workspaceId,
      automationId: trackedLink.automationId,
      socialAccountId: trackedLink.automation.socialAccountId,
      trackedLinkId: trackedLink.id,
      ipHash: hashClickIp(getRequestIp(request)),
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      src,
    },
  });

  return NextResponse.redirect(
    buildDestination(trackedLink.destinationUrl, src),
    { status: 302 }
  );
}
