import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { safeRevisionSnapshot } from "@/lib/campaigns/history";
import { deliveryHistorySelect, safeDeliveryHistory } from "@/lib/queue/delivery-history";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Missing campaign ID" }, { status: 400 });
  const campaign = await prisma.automation.findFirst({ where: { id, workspaceId }, select: { id: true, lifecycle: true, version: true } });
  if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  const [delivery, revisions, conversions] = await Promise.all([
    prisma.deliveryEvent.findMany({ where: { workspaceId, automationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: deliveryHistorySelect }),
    prisma.campaignRevision.findMany({ where: { workspaceId, automationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
      select: { id: true, actorId: true, snapshot: true, createdAt: true } }),
    prisma.integrationEvent.groupBy({ by: ["eventType"], where: { workspaceId, automationId: id,
      eventType: { in: ["conversion.resource_downloaded", "conversion.form_completed", "conversion.qualified_inquiry"] } }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ success: true, data: {
    campaign, delivery: delivery.map(safeDeliveryHistory),
    revisions: revisions.map((item) => ({ ...item, snapshot: safeRevisionSnapshot(item.snapshot) })),
    conversions: conversions.map(item => ({ eventType: item.eventType, count: item._count._all })),
    limits: { delivery: 100, revisions: 50 },
  } }, { headers: { "Cache-Control": "no-store" } });
}
