import { restTool, type IdParams } from "@/lib/integrations/rest";

export async function GET(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "get_campaign", () => ({ id }));
}

export async function PATCH(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "update_campaign", body => ({ ...body, id }), { body: true });
}

export async function DELETE(request: Request, { params }: IdParams) {
  const { id } = await params;
  return restTool(request, "delete_campaign", () => ({ id }));
}
