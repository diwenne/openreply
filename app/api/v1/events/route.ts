import { prisma } from "@/lib/db/client";
import { authenticateService, requireScope } from "@/lib/integrations/auth";
import { apiError, ApiError, checkOrigin } from "@/lib/integrations/http";
import { decodeCursor, encodeCursor } from "@/lib/integrations/event-cursor";

/** Pull the durable source of truth; no network side effect coupled to sending.
 * Re-poll with overlap and eventId+status dedupe, as commit order != timestamp order. */
export async function GET(request: Request) {
  try {
    checkOrigin(request);
    const context = await authenticateService(request); requireScope(context, "events:read");
    const url = new URL(request.url);
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const since = url.searchParams.get("since") ?? new Date(Date.now() - 86400000).toISOString();
    if (!Number.isFinite(Date.parse(since))) throw new ApiError("Invalid since timestamp");
    const lower = new Date(cursor?.time ?? since);
    const until = new Date(cursor?.until ?? new Date(Date.now() - 15000).toISOString());
    if (lower > until) throw new ApiError("since must precede the settled snapshot");
    const [integration, delivery] = await Promise.all([
      prisma.integrationEvent.findMany({ where: { workspaceId: context.workspaceId, createdAt: { gte: lower, lte: until },
        ...(cursor?.id.startsWith("i:") ? { OR: [{ createdAt: { gt: lower } }, { id: { gt: cursor.id.slice(2) } }] } : cursor?.id.startsWith("d:") ? {} : {}) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 201,
        select: { id: true, automationId: true, eventType: true, payload: true, createdAt: true } }),
      prisma.deliveryEvent.findMany({ where: { workspaceId: context.workspaceId, updatedAt: { gte: lower, lte: until },
        status: { in: ["SENT", "FAILED", "UNCONFIRMED", "SKIPPED"] },
        ...(cursor?.id.startsWith("d:") ? { OR: [{ updatedAt: { gt: lower } }, { id: { gt: cursor.id.slice(2) } }] } : cursor?.id.startsWith("i:") ? { updatedAt: { gt: lower, lte: until } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 201,
        select: { id: true, automationId: true, stage: true, status: true, campaignVersion: true, sentAt: true, updatedAt: true } }),
    ]);
    const all = [
      ...integration.map(event => ({ eventId: `i:${event.id}`, campaignId: event.automationId, type: event.eventType,
        occurredAt: event.createdAt.toISOString(), data: event.payload })),
      ...delivery.map(event => ({ eventId: `d:${event.id}`, campaignId: event.automationId, type: `delivery.${event.stage.toLowerCase()}.${event.status.toLowerCase()}`,
        occurredAt: event.updatedAt.toISOString(), data: { status: event.status, stage: event.stage, campaignVersion: event.campaignVersion, sentAt: event.sentAt } })),
    ].filter(event => !cursor || event.occurredAt > cursor.time || (event.occurredAt === cursor.time && event.eventId > cursor.id))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const events = all.slice(0, 200);
    const last = events.at(-1);
    return Response.json({ events, until: until.toISOString(), nextCursor: all.length > 200 && last ? encodeCursor({ time: last.occurredAt, id: last.eventId, until: until.toISOString() }) : null,
      nextSince: new Date(until.getTime() - 15 * 60 * 1000).toISOString(),
      deliverySemantics: "at-least-once: checkpoint after processing all pages; re-poll 15-minute overlap; dedupe by eventId + data.status. Long-running transactions beyond overlap require a wider replay." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
