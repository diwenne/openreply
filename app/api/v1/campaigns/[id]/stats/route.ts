import { restTool, type IdParams } from "@/lib/integrations/rest";

export async function GET(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "get_campaign_stats", () => ({ id }));
}
