import { z } from "zod";
import { getCampaign, getCampaignStats, listCampaigns } from "./campaigns";
import { requireScope, type ServiceContext } from "./auth";
import { ApiError } from "./http";

const idSchema = { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 100 } }, required: ["id"], additionalProperties: false };
const tools = [
  { name: "list_campaigns", description: "List up to 100 campaigns in this workspace; use get_campaign for complete settings and destination links.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_campaign", description: "Read campaign settings and ordered destination links. Missing links are null, not invented.", inputSchema: idSchema },
  { name: "get_campaign_stats", description: "Read aggregate send outcomes and raw link requests, not recipient conversions.", inputSchema: idSchema },
];

export function listTools(context: ServiceContext) {
  if (!context.scopes.includes("campaigns:read")) return [];
  return tools.map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
}

export async function callTool(context: ServiceContext, name: string, args: unknown) {
  requireScope(context, "campaigns:read");
  if (name === "list_campaigns") {
    if (!z.object({}).strict().safeParse(args).success) throw new ApiError("Invalid tool arguments");
    return listCampaigns(context);
  }
  if (!tools.some(tool => tool.name === name)) throw new ApiError("Unknown tool", 404);
  const input = z.object({ id: z.string().min(1).max(100) }).strict().safeParse(args);
  if (!input.success) throw new ApiError("Campaign id required");
  return name === "get_campaign" ? getCampaign(context, input.data.id) : getCampaignStats(context, input.data.id);
}
