import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { authenticateService, requireScope } from "@/lib/integrations/auth";
import { apiError, ApiError, checkOrigin, readJson } from "@/lib/integrations/http";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const context = await authenticateService(request); requireScope(context, "conversions:write");
    const input = z.object({ campaignId: z.string().min(1).max(100), externalId: z.string().min(8).max(128),
      type: z.enum(["resource_downloaded", "form_completed", "qualified_inquiry"]),
      // An opaque customer-owned reference, not an Instagram-ID-to-email inference.
      subjectRef: z.string().max(128).optional(), value: z.number().nonnegative().max(1000000).optional(),
    }).strict().safeParse(await readJson(request));
    if (!input.success) throw new ApiError("Invalid conversion event");
    const data = input.data;
    const externalId = `conversion:${data.externalId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.workspaceId}:${externalId}`}, 0))`;
      const existing = await tx.integrationEvent.findUnique({ where: { workspaceId_externalId: { workspaceId: context.workspaceId, externalId } } });
      if (existing) {
        if ((existing.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new ApiError("Event id reused for different content", 409);
        return { eventId: existing.id, replayed: true };
      }
      const campaign = await tx.automation.findFirst({ where: { workspaceId: context.workspaceId, id: data.campaignId }, select: { id: true } });
      if (!campaign) throw new ApiError("Campaign not found", 404);
      const event = await tx.integrationEvent.create({ data: { workspaceId: context.workspaceId, automationId: campaign.id,
        externalId, eventType: `conversion.${data.type}`, payload: { ...data, fingerprint } } });
      return { eventId: event.id, replayed: false };
    });
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
