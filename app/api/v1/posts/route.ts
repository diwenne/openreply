import { query, queryNumber, restTool } from "@/lib/integrations/rest";

export async function GET(request: Request) {
  return restTool(request, "list_posts", () => ({ instagramAccountId: query(request, "instagramAccountId"), limit: queryNumber(request, "limit") }));
}
