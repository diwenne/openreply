import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { parseCsv, instagramShortcode } from "@/lib/utils/csv";
import { getAllUserMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { generateReportShareSlug } from "@/lib/reports/share";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const importSchema = z.object({
  instagramAccountId: z.string().min(1),
  csv: z.string().min(1),
});

function splitKeywords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((k) => k.slice(0, 50))
    )
  );
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return /^(true|yes|1|active|on)$/i.test(value.trim());
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can import campaigns" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Provide an account and CSV content" },
      { status: 400 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    context.workspaceId,
    parsed.data.instagramAccountId
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 400 }
    );
  }

  // Build a lookup from the account's posts so a pasted URL resolves to a
  // media ID. Instagram media URLs expire but IDs and shortcodes are stable.
  const mediaByShortcode = new Map<string, { id: string; permalink?: string }>();
  const mediaIds = new Set<string>();
  try {
    const token = decryptToken(account.accessToken);
    const media = await getAllUserMedia(token, 500);
    for (const item of media) {
      mediaIds.add(item.id);
      const code = item.permalink ? instagramShortcode(item.permalink) : null;
      if (code) mediaByShortcode.set(code, { id: item.id, permalink: item.permalink });
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not load this account's posts from Instagram" },
      { status: 502 }
    );
  }

  const existing = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: { postId: true },
  });
  const existingPostIds = new Set(existing.map((a) => a.postId));

  const rows = parseCsv(parsed.data.csv);
  const created: { name: string; postId: string }[] = [];
  const skipped: { line: number; post: string; reason: string }[] = [];
  const seenInThisImport = new Set<string>();

  let line = 1; // header is line 1; first data row is line 2
  for (const row of rows) {
    line++;
    const postValue = (row.post ?? row.post_url ?? "").trim();
    const keywords = splitKeywords(row.keywords ?? "");
    const dmMessage = (row.dm_message ?? row.message ?? "").trim();

    if (!postValue) {
      skipped.push({ line, post: "", reason: "missing post" });
      continue;
    }
    if (keywords.length === 0) {
      skipped.push({ line, post: postValue, reason: "missing keywords" });
      continue;
    }
    if (!dmMessage) {
      skipped.push({ line, post: postValue, reason: "missing dm_message" });
      continue;
    }

    // Resolve the post to a media ID.
    let postId: string | null = null;
    let postUrl: string | null = null;
    const code = instagramShortcode(postValue);
    if (code && mediaByShortcode.has(code)) {
      const hit = mediaByShortcode.get(code)!;
      postId = hit.id;
      postUrl = hit.permalink ?? postValue;
    } else if (/^\d+$/.test(postValue) && mediaIds.has(postValue)) {
      postId = postValue;
    } else if (/^\d+$/.test(postValue)) {
      // A raw numeric ID not in the recent-media list. Trust it.
      postId = postValue;
    }

    if (!postId) {
      skipped.push({
        line,
        post: postValue,
        reason: "post not found on this account",
      });
      continue;
    }

    if (existingPostIds.has(postId) || seenInThisImport.has(postId)) {
      skipped.push({ line, post: postValue, reason: "a campaign already exists for this post" });
      continue;
    }

    const trackedUrl = (row.tracked_url ?? "").trim();
    const validTrackedUrl = /^https?:\/\//i.test(trackedUrl) ? trackedUrl : null;
    const publicReply = (row.public_reply ?? "").trim();

    const name = (row.name ?? "").trim().slice(0, 100) || `Imported: ${keywords[0]}`;
    const goal = (row.goal ?? "").trim().slice(0, 120) || null;

    await prisma.automation.create({
      data: {
        name,
        goal,
        postId,
        postUrl,
        keywords,
        dmMessage: dmMessage.slice(0, 1000),
        publicReplyEnabled: Boolean(publicReply),
        publicReplyMessage: publicReply ? publicReply.slice(0, 1000) : null,
        isActive: parseBool(row.active, true),
        wholeWordMatch: parseBool(row.whole_word, true),
        workspaceId: context.workspaceId,
        instagramAccountId: account.id,
        reportShareSlug: generateReportShareSlug(),
        ...(validTrackedUrl
          ? {
              trackedLinks: {
                create: {
                  workspaceId: context.workspaceId,
                  slug: generateTrackedLinkSlug(),
                  label: "Primary campaign link",
                  destinationUrl: validTrackedUrl,
                },
              },
            }
          : {}),
      },
    });

    seenInThisImport.add(postId);
    created.push({ name, postId });
  }

  return NextResponse.json({
    success: true,
    data: { created, skipped },
  });
}
