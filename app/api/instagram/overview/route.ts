import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  getMediaInsights,
  getUserMedia,
  PermissionError,
  type InstagramMedia,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

export interface OverviewPost {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaType: string;
  timestamp: string;
  views: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  saved: number | null;
  shares: number | null;
}

export interface OverviewResponse {
  account: { id: string; username: string };
  accounts: Array<{ id: string; username: string }>;
  insightsAvailable: boolean;
  totals: {
    posts: number;
    views: number;
    reach: number;
    likes: number;
    comments: number;
    saved: number;
    shares: number;
    interactions: number;
  };
  posts: OverviewPost[];
}

function isVideoLike(media: InstagramMedia): boolean {
  return (
    media.media_product_type === "REELS" || media.media_type === "VIDEO"
  );
}

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Instagram account not connected. Please connect your account first.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = decryptToken(account.accessToken);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 50)
      : 50;

    const media = await getUserMedia(accessToken, limit);

    // Likes and comments come free with basic media fields. Views / reach /
    // saved / shares require the insights permission, so fetch them per media
    // and degrade gracefully if the token was granted before that scope.
    let insightsAvailable = false;
    let permissionDenied = false;

    const insights = await Promise.all(
      media.map(async (m) => {
        const metrics = isVideoLike(m)
          ? ["views", "reach", "saved", "shares", "total_interactions"]
          : ["reach", "saved", "shares", "total_interactions"];
        try {
          const data = await getMediaInsights(accessToken, m.id, metrics);
          insightsAvailable = true;
          return data;
        } catch (err) {
          if (err instanceof PermissionError) permissionDenied = true;
          return null;
        }
      })
    );

    const posts: OverviewPost[] = media.map((m, i) => {
      const ins = insights[i];
      const likes = m.like_count ?? 0;
      const comments = m.comments_count ?? 0;
      return {
        id: m.id,
        caption: m.caption?.trim().slice(0, 120) ?? null,
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        mediaType: m.media_product_type ?? m.media_type,
        timestamp: m.timestamp,
        views: ins?.views ?? null,
        reach: ins?.reach ?? null,
        likes,
        comments,
        saved: ins?.saved ?? null,
        shares: ins?.shares ?? null,
      };
    });

    const totals = posts.reduce(
      (acc, p) => {
        acc.posts += 1;
        acc.views += p.views ?? 0;
        acc.reach += p.reach ?? 0;
        acc.likes += p.likes;
        acc.comments += p.comments;
        acc.saved += p.saved ?? 0;
        acc.shares += p.shares ?? 0;
        acc.interactions += p.likes + p.comments + (p.saved ?? 0) + (p.shares ?? 0);
        return acc;
      },
      {
        posts: 0,
        views: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        saved: 0,
        shares: 0,
        interactions: 0,
      }
    );

    const accounts = await prisma.instagramAccount.findMany({
      where: { workspaceId },
      orderBy: { connectedAt: "desc" },
      select: { id: true, username: true },
    });

    const data: OverviewResponse = {
      account: { id: account.id, username: account.username },
      accounts,
      insightsAvailable: insightsAvailable && !permissionDenied,
      totals,
      posts,
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Instagram Overview] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load Instagram overview" },
      { status: 500 }
    );
  }
}
