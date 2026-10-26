import { restTool, type IdParams } from "@/lib/integrations/rest";

export async function POST(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "pause_campaign", () => ({ id }));
}
