import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * Internal campaign-stats endpoint — lets sibling services on this host (the
 * label-platform marketing calendar) show, per SKU, whether an OpenReply
 * campaign exists and how it performs.
 *
 * GET ?sku=<catno> → { automation: {id, name, isActive, postId, dmSent,
 * clicks, createdAt} | null }
 *
 * Matching mirrors the attach cron's binding key: Automation.catnoTag,
 * case-insensitive. The newest campaign wins when a SKU was re-campaigned.
 *
 * Auth: Bearer CRON_SECRET (same contract as the cron routes).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const sku = request.nextUrl.searchParams.get("sku")?.trim();
  if (!sku) {
    return NextResponse.json(
      { success: false, error: "sku query parameter is required" },
      { status: 400 }
    );
  }

  const automation = await prisma.automation.findFirst({
    where: { catnoTag: { equals: sku, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isActive: true, postId: true, createdAt: true },
  });

  if (!automation) {
    return NextResponse.json({ success: true, data: { automation: null } });
  }

  const [dmSent, clicks] = await Promise.all([
    prisma.dmLog.count({ where: { automationId: automation.id, status: "SENT" } }),
    prisma.linkClick.count({ where: { automationId: automation.id } }),
  ]);

  return NextResponse.json({
    success: true,
    data: { automation: { ...automation, dmSent, clicks } },
  });
}
