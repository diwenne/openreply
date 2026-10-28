import { restTool } from "@/lib/integrations/rest";

export async function GET(request: Request) {
  return restTool(request, "list_instagram_accounts");
}
