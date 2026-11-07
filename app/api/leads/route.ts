import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";

// Meta lets an account message someone freely for 24 hours after that person's
// last message or button tap.
const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

const FILTERS = ["all", "window", "replied", "not_replied"] as const;
type LeadFilter = (typeof FILTERS)[number];

function filterWhere(filter: LeadFilter, now: Date): Prisma.LeadWhereInput {
  switch (filter) {
    case "window":
      return {
        lastInboundAt: { gt: new Date(now.getTime() - MESSAGING_WINDOW_MS) },
      };
    case "replied":
      return { lastRepliedAt: { not: null } };
    case "not_replied":
      return { lastRepliedAt: null };
    default:
      return {};
  }
}

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );
  const rawFilter = searchParams.get("filter");
  const filter: LeadFilter = FILTERS.includes(rawFilter as LeadFilter)
    ? (rawFilter as LeadFilter)
    : "all";
  const instagramAccountId = searchParams.get("instagramAccountId");
  const now = new Date();

  const where: Prisma.LeadWhereInput = {
    workspaceId,
    ...filterWhere(filter, now),
    ...(instagramAccountId && instagramAccountId !== "all"
      ? { instagramAccountId }
      : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      // updatedAt moves on every inbound or outbound touch.
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        igsid: true,
        username: true,
        firstSeenAt: true,
        lastInboundAt: true,
        lastRepliedAt: true,
        lastOutboundAt: true,
        lastFollowUpSentAt: true,
        sourceAutomation: { select: { id: true, name: true } },
        instagramAccount: { select: { username: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      leads: leads.map((lead) => ({
        ...lead,
        windowClosesAt: lead.lastInboundAt
          ? new Date(lead.lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
}
