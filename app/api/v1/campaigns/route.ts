import { query, restTool } from "@/lib/integrations/rest";

export async function GET(request: Request) {
  const id = query(request, "id");
  const stats = new URL(request.url).searchParams.has("stats");
  if (stats && !id) return Response.json({ error: "Campaign id required for stats" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (!id) return restTool(request, "list_campaigns");
  return restTool(request, stats ? "get_campaign_stats" : "get_campaign", () => ({ id }));
}

export async function POST(request: Request) {
  return restTool(request, "create_campaign", body => body, { body: true, status: 201 });
}
