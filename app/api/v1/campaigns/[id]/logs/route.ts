import { query, queryNumber, restTool, type IdParams } from "@/lib/integrations/rest";

export async function GET(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "list_dm_logs", () => ({ id, limit: queryNumber(request, "limit"), status: query(request, "status") }));
}
