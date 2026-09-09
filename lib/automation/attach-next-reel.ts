import { prisma } from "@/lib/db/client";
import { getUserMedia, type InstagramMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

function isReel(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS";
}

export type AttachNextReelResult = {
  checked: number;
  bound: number;
  failedAccounts: number;
};

/**
 * Bind each pending "next reel" campaign to the earliest reel published after
 * it was created. Kept outside the HTTP route so the long-running worker can
 * run the same check on every comment-poll interval.
 */
export async function attachPendingNextReels(): Promise<AttachNextReelResult> {
  const pending = await prisma.automation.findMany({
    where: { pendingNextReel: true },
    include: { instagramAccount: true },
  });

  const byAccount = new Map<
    string,
    { account: (typeof pending)[number]["instagramAccount"]; automations: typeof pending }
  >();
  for (const automation of pending) {
    const entry = byAccount.get(automation.instagramAccountId);
    if (entry) entry.automations.push(automation);
    else {
      byAccount.set(automation.instagramAccountId, {
        account: automation.instagramAccount,
        automations: [automation],
      });
    }
  }

  let checked = 0;
  let bound = 0;
  let failedAccounts = 0;

  for (const { account, automations } of byAccount.values()) {
    checked += automations.length;
    if (!account?.accessToken) continue;

    let reels: InstagramMedia[];
    try {
      const media = await getUserMedia(decryptToken(account.accessToken), 25);
      reels = media
        .filter(isReel)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      failedAccounts += 1;
      console.error("[attach-next-reel] media fetch failed", account.id, error);
      continue;
    }

    for (const automation of automations) {
      const nextReel = reels.find(
        (reel) => new Date(reel.timestamp) > automation.createdAt
      );
      if (!nextReel) continue;

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          postId: nextReel.id,
          postUrl: nextReel.permalink ?? null,
          pendingNextReel: false,
        },
      });
      bound += 1;
    }
  }

  return { checked, bound, failedAccounts };
}
