import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { hashServiceToken, newServiceToken, SERVICE_SCOPES } from "@/lib/integrations/auth";
import { apiError, ApiError, checkOrigin, readJson } from "@/lib/integrations/http";

const safeFields = { id: true, name: true, scopes: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true } as const;
export async function GET() {
  try {
    const context = await getCurrentWorkspaceContext();
    if (!context || !canManageWorkspace(context.role)) throw new ApiError("Admin role required", 403);
    return Response.json({ keys: await prisma.serviceKey.findMany({ where: { workspaceId: context.workspaceId }, select: safeFields }) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const context = await getCurrentWorkspaceContext();
    if (!context || !canManageWorkspace(context.role)) throw new ApiError("Admin role required", 403);
    const input = z.object({ name: z.string().trim().min(1).max(100), scopes: z.array(z.enum(SERVICE_SCOPES)).min(1).max(4),
      days: z.number().int().min(1).max(90).default(30) }).strict().safeParse(await readJson(request));
    if (!input.success) throw new ApiError("Invalid key configuration");
    const token = newServiceToken();
    const key = await prisma.serviceKey.create({ data: { name: input.data.name, scopes: [...new Set(input.data.scopes)],
      workspaceId: context.workspaceId, tokenHash: hashServiceToken(token), expiresAt: new Date(Date.now() + input.data.days * 86400000) }, select: safeFields });
    return Response.json({ key, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const context = await getCurrentWorkspaceContext();
    if (!context || !canManageWorkspace(context.role)) throw new ApiError("Admin role required", 403);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError("Key id required");
    const result = await prisma.serviceKey.updateMany({ where: { id, workspaceId: context.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new ApiError("Key not found or already revoked", 404);
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
