import { z } from "zod";
import { DmStatus } from "@/app/generated/prisma/enums";
import { createCampaignFields, updateCampaignSchema } from "@/lib/campaigns/mutations";
import {
  activateCampaign, createCampaign, deleteCampaign, getCampaign, getCampaignStats,
  listCampaigns, listDmLogs, listInstagramAccounts, listPosts, pauseCampaign, updateCampaign,
} from "./campaigns";
import type { ServiceContext } from "./auth";
import type { ServiceScope } from "./auth";
import { ApiError } from "./http";

const id = z.string().min(1).max(100);
const idOnly = z.object({ id }).strict();
// The key decides who may set isActive (activate_campaign / pause_campaign),
// and report sharing stays a dashboard setting. Every other field, and every
// rule about how fields combine, comes from the dashboard's own schemas.
const createInput = createCampaignFields.omit({ isActive: true }).strict();
const updateInput = updateCampaignSchema.omit({ isActive: true, reportShareEnabled: true }).extend({ id }).strict();
const postsInput = z.object({
  instagramAccountId: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();
const logsInput = z.object({
  id, limit: z.number().int().min(1).max(100).optional(),
  status: z.enum(Object.values(DmStatus) as [DmStatus, ...DmStatus[]]).optional(),
}).strict();

type Annotations = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
const read: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write: Annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

type Tool = {
  name: string;
  description: string;
  /** The key needs at least one of these scopes to see and call the tool. */
  scopes: ServiceScope[];
  annotations: Annotations;
  input: z.ZodType;
  run: (context: ServiceContext, args: never) => Promise<unknown>;
};

function tool<S extends z.ZodType>(definition: Omit<Tool, "input" | "run"> & {
  input: S; run: (context: ServiceContext, args: z.output<S>) => Promise<unknown>;
}): Tool {
  return definition as unknown as Tool;
}

const tools: Tool[] = [
  tool({ name: "list_campaigns", scopes: ["campaigns:read"], annotations: read, input: z.object({}).strict(),
    description: "List up to 100 campaigns in this workspace; use get_campaign for complete settings and destination links.",
    run: context => listCampaigns(context) }),
  tool({ name: "get_campaign", scopes: ["campaigns:read"], annotations: read, input: idOnly,
    description: "Read campaign settings and ordered destination links. Missing links are null, not invented.",
    run: (context, args) => getCampaign(context, args.id) }),
  tool({ name: "get_campaign_stats", scopes: ["campaigns:read"], annotations: read, input: idOnly,
    description: "Read aggregate send outcomes and raw link requests, not recipient conversions.",
    run: (context, args) => getCampaignStats(context, args.id) }),
  tool({ name: "list_instagram_accounts", scopes: ["campaigns:read"], annotations: read, input: z.object({}).strict(),
    description: "List the Instagram accounts connected to this workspace (id and username). Pass an id as instagramAccountId to list_posts or create_campaign.",
    run: context => listInstagramAccounts(context) }),
  tool({ name: "list_posts", scopes: ["campaigns:read"], annotations: { ...read, openWorldHint: true }, input: postsInput,
    description: "List recent posts and reels of a connected Instagram account (default: the most recently connected). Use a post id as postId in create_campaign or update_campaign.",
    run: (context, args) => listPosts(context, args) }),
  tool({ name: "list_dm_logs", scopes: ["campaigns:read"], annotations: read, input: logsInput,
    description: "Read what happened with each comment that matched a campaign, newest first: status (SENT, FAILED, SKIPPED_*), error and public reply outcome. Up to 100.",
    run: (context, args) => listDmLogs(context, args.id, args) }),
  tool({ name: "create_campaign", scopes: ["campaigns:write"], annotations: write, input: createInput,
    description: "Create a campaign. It is always created PAUSED and sends nothing until activate_campaign is called with a key that has campaigns:activate. Target one post (postId), every post (matchAnyPost) or the next reel (pendingNextReel); give keywords or matchAnyWord. Text fields may use {username}.",
    run: (context, args) => createCampaign(context, args) }),
  tool({ name: "update_campaign", scopes: ["campaigns:write"], annotations: { ...write, idempotentHint: true }, input: updateInput,
    description: "Change a campaign's texts, keywords, target post, public reply or links. Only the fields given change; an empty string for a link removes it. A live campaign can only be edited with campaigns:activate; otherwise pause it first.",
    run: (context, { id: campaignId, ...fields }) => updateCampaign(context, campaignId, fields) }),
  tool({ name: "pause_campaign", scopes: ["campaigns:write", "campaigns:activate"], annotations: { ...write, idempotentHint: true }, input: idOnly,
    description: "Pause a campaign so it stops replying. Nothing is sent.",
    run: (context, args) => pauseCampaign(context, args.id) }),
  tool({ name: "activate_campaign", scopes: ["campaigns:activate"], annotations: { ...write, idempotentHint: true, openWorldHint: true }, input: idOnly,
    description: "Turn a campaign on: from now on, matching comments get the campaign's DM and public reply on Instagram. Only do this once a person has approved the campaign's texts.",
    run: (context, args) => activateCampaign(context, args.id) }),
  tool({ name: "delete_campaign", scopes: ["campaigns:write"], annotations: { ...write, destructiveHint: true, idempotentHint: true }, input: idOnly,
    description: "Permanently delete a paused campaign, with its DM logs and tracked links. Pause it first.",
    run: (context, args) => deleteCampaign(context, args.id) }),
];

function inputSchema(schema: z.ZodType) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...json } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  return json;
}

const allowed = (context: ServiceContext, tool: Tool) => tool.scopes.some(scope => context.scopes.includes(scope));

export function listTools(context: ServiceContext) {
  return tools.filter(tool => allowed(context, tool)).map(tool => ({
    name: tool.name, description: tool.description, inputSchema: inputSchema(tool.input), annotations: tool.annotations,
  }));
}

export async function callTool(context: ServiceContext, name: string, args: unknown) {
  const tool = tools.find(candidate => candidate.name === name);
  if (!tool) throw new ApiError("Unknown tool", 404);
  if (!allowed(context, tool)) throw new ApiError(`Missing scope: ${tool.scopes.join(" or ")}`, 403);
  const input = tool.input.safeParse(args ?? {});
  if (!input.success) throw new ApiError("Invalid tool arguments", 400, z.flattenError(input.error as z.ZodError<Record<string, unknown>>));
  return tool.run(context, input.data as never);
}
