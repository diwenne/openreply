import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getUserMedia, type InstagramMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { captionMatchesCatno } from "@/lib/release-sync/shop-feed";

/**
 * Binds "next reel" campaigns to a real post.
 *
 * Instagram sends no webhook when a new media is published, so we poll: for
 * every campaign awaiting the creator's next reel, find the earliest reel that
 * was posted after the campaign was created and attach the campaign to it.
 * Runs on a schedule (see vercel.json) — the campaign goes live within one
 * cron interval of the reel being posted.
 */

function isReel(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS";
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const pending = await prisma.automation.findMany({
    where: { pendingNextReel: true },
    include: { instagramAccount: true },
  });

  // Group by connected account so we fetch each account's media only once.
  const byAccount = new Map<
    string,
    { account: (typeof pending)[number]["instagramAccount"]; automations: typeof pending }
  >();
  for (const automation of pending) {
    const key = automation.instagramAccountId;
    const entry = byAccount.get(key);
    if (entry) entry.automations.push(automation);
    else byAccount.set(key, { account: automation.instagramAccount, automations: [automation] });
  }

  let bound = 0;
  let checked = 0;
  const failures: string[] = [];

  for (const { account, automations } of byAccount.values()) {
    checked += automations.length;
    if (!account?.accessToken) continue;

    let reels: InstagramMedia[];
    let allMedia: InstagramMedia[];
    try {
      const token = decryptToken(account.accessToken);
      const media = await getUserMedia(token, 25);
      reels = media
        .filter(isReel)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      allMedia = [...media].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (err) {
      failures.push(account.id);
      console.error("[attach-next-reel] media fetch failed", account.id, err);
      continue;
    }

    for (const automation of automations) {
      // Deterministic binding first: a campaign carrying a catno binds to the
      // earliest media (any type, square posts included) whose caption
      // contains #<catno>. Without a match it falls back to next-reel.
      const catnoMedia = automation.catnoTag
        ? allMedia.find(
            (m) =>
              new Date(m.timestamp) > automation.createdAt &&
              captionMatchesCatno(m.caption, automation.catnoTag as string)
          )
        : undefined;

      // The "next" reel = the earliest one posted after the campaign was created.
      const target =
        catnoMedia ??
        reels.find((reel) => new Date(reel.timestamp) > automation.createdAt);
      if (!target) continue;

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          postId: target.id,
          postUrl: target.permalink ?? null,
          pendingNextReel: false,
        },
      });
      bound += 1;
    }
  }

  return NextResponse.json({
    success: true,
    data: { checked, bound, failedAccounts: failures.length },
  });
}
