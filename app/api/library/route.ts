import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { contentSchema, resourceSchema } from "@/lib/library/schema";
import { apiError, ApiError, checkOrigin, readJson } from "@/lib/library/http";
import { createLibraryDraft } from "@/lib/library/drafts";

export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const assets = await prisma.workspaceAsset.findMany({ where: { workspaceId: context.workspaceId }, orderBy: { updatedAt: "desc" }, take: 200 });
  return Response.json({ assets, canManage: canManageWorkspace(context.role) }, { headers: { "Cache-Control": "no-store" } });
}

const inputSchema = z.object({
  action: z.enum(["save", "create_draft"]), id: z.string().optional(), version: z.number().int().positive().optional(),
  kind: z.enum(["RESOURCE", "TEMPLATE"]).optional(), name: z.string().trim().min(1).max(100).optional(),
  data: z.unknown().optional(), instagramAccountId: z.string().optional(), keyword: z.string().min(1).max(50).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const context = await getCurrentWorkspaceContext();
    if (!context) throw new ApiError("Unauthorized", 401);
    if (!canManageWorkspace(context.role)) throw new ApiError("Admin role required", 403);
    const parsed = inputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError("Invalid library request");
    const input = parsed.data;
    if (input.action === "create_draft") {
      const asset = await prisma.workspaceAsset.findFirst({ where: { id: input.id ?? "", workspaceId: context.workspaceId } });
      if (!asset) throw new ApiError("Library item not found", 404);
      const content = asset.kind === "TEMPLATE" ? contentSchema.parse(asset.data) : {
        name: asset.name, ...resourceSchema.parse(asset.data), keywords: input.keyword ? [input.keyword] : [],
        trackedDestinationUrl: resourceSchema.parse(asset.data).destinationUrl,
      };
      return Response.json(await createLibraryDraft({ workspaceId: context.workspaceId, actorId: context.userId }, {
        ...content, instagramAccountId: input.instagramAccountId, idempotencyKey: input.idempotencyKey,
      }));
    }
    if (!input.kind || !input.name) throw new ApiError("Name and kind required");
    const data = (input.kind === "TEMPLATE" ? contentSchema : resourceSchema).safeParse(input.data);
    if (!data.success) throw new ApiError(data.error.issues.map(i => i.message).join("; "));
    if (!input.id) {
      const asset = await prisma.workspaceAsset.create({ data: { workspaceId: context.workspaceId, kind: input.kind, name: input.name, data: data.data } });
      return Response.json({ asset }, { status: 201 });
    }
    // Optimistic version check prevents a stale editor overwriting a teammate's work.
    if (!input.version) throw new ApiError("Version required when updating");
    const updated = await prisma.workspaceAsset.updateMany({ where: { id: input.id, workspaceId: context.workspaceId,
      version: input.version, kind: input.kind }, data: { name: input.name, data: data.data, version: { increment: 1 } } });
    if (!updated.count) throw new ApiError("Item changed or not found; reload", 409);
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
