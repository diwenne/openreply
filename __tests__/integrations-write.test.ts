import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const automation = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  return {
    keys: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    automation,
    workspace: { findUnique: vi.fn() },
    instagramAccount: { findFirst: vi.fn(), findMany: vi.fn() },
    dmLog: { findMany: vi.fn(), groupBy: vi.fn() },
    linkClick: { count: vi.fn() },
    syncLinks: vi.fn(),
    media: vi.fn(),
    igContext: vi.fn(),
    eval: vi.fn(),
    context: vi.fn(),
  };
});

vi.mock("@/lib/db/client", () => ({
  prisma: {
    serviceKey: state.keys, automation: state.automation, workspace: state.workspace,
    instagramAccount: state.instagramAccount, dmLog: state.dmLog, linkClick: state.linkClick,
    $transaction: (fn: (tx: unknown) => unknown) => fn({ automation: state.automation }),
  },
}));
vi.mock("@/lib/campaigns/links", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/campaigns/links")>()),
  syncCampaignLinks: state.syncLinks,
}));
vi.mock("@/lib/instagram/provider", () => ({ getUserMedia: state.media, createInstagramContext: state.igContext }));
vi.mock("@/lib/workspace-access", () => ({ getCurrentWorkspaceContext: state.context, canManageWorkspace: (role: string) => ["OWNER", "ADMIN"].includes(role) }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "ws" }));
vi.mock("ioredis", () => ({ default: class { status = "ready"; eval = state.eval; listenerCount() { return 1; } } }));

import { callTool, listTools } from "../lib/integrations/mcp";
import { POST as mcp } from "../app/api/mcp/route";
import { POST as createRest } from "../app/api/v1/campaigns/route";
import { PATCH as patchRest, DELETE as deleteRest } from "../app/api/v1/campaigns/[id]/route";
import { POST as activateRest } from "../app/api/v1/campaigns/[id]/activate/route";
import { GET as logsRest } from "../app/api/v1/campaigns/[id]/logs/route";
import { GET as postsRest } from "../app/api/v1/posts/route";
import { POST as createKey } from "../app/api/integrations/keys/route";
import { POST as dashboardCreate, PATCH as dashboardPatch } from "../app/api/automations/route";
import { NextRequest } from "next/server";

const READ = ["campaigns:read"];
const WRITE = ["campaigns:read", "campaigns:write"];
const ALL = ["campaigns:read", "campaigns:write", "campaigns:activate"];
const ctx = (scopes: string[], workspaceId = "ws") => ({ workspaceId, keyId: "key", scopes });

const token = `orp_${"b".repeat(43)}`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
const json = (url: string, method: string, body?: unknown) =>
  new Request(`https://example.test${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const useKey = (scopes: string[], workspaceId = "ws") =>
  state.keys.findUnique.mockResolvedValue({ id: "key", workspaceId, scopes, expiresAt: new Date("2099-01-01"), revokedAt: null });

const newCampaign = { name: "Demo", keywords: ["DEMO"], matchAnyPost: true, dmMessage: "Hi {username}" };
// What a campaign row looks like when only the given workspace may see it.
function storeCampaign(row: { id: string; workspaceId: string; isActive: boolean }) {
  state.automation.findFirst.mockImplementation(async ({ where }: { where: { id: string; workspaceId: string } }) =>
    where.id === row.id && where.workspaceId === row.workspaceId ? { ...row, trackedLinks: [] } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("NEXTAUTH_URL", "https://example.test");
  state.eval.mockResolvedValue(1);
  state.workspace.findUnique.mockResolvedValue({ id: "ws" });
  state.instagramAccount.findFirst.mockImplementation(async ({ where }: { where: { workspaceId: string; id?: string } }) =>
    where.workspaceId === "ws" && (!where.id || where.id === "acc") ? { id: "acc", workspaceId: "ws", username: "example_account", provider: "META", accessToken: "enc", instagramId: "1", zernioAccountId: null } : null);
  state.automation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
  state.automation.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
  state.automation.delete.mockResolvedValue({ id: "c1" });
  state.dmLog.findMany.mockResolvedValue([]);
  state.igContext.mockResolvedValue({ provider: "META", accessToken: "plain" });
  state.media.mockResolvedValue([{ id: "p1", caption: "Hola", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://instagram.com/reel/x", timestamp: "2026-10-01T00:00:00Z", media_url: "https://cdn/x.mp4" }]);
  useKey(READ);
});

describe("scopes decide which tools exist", () => {
  it.each([
    [READ, ["list_campaigns", "get_campaign", "get_campaign_stats", "list_instagram_accounts", "list_posts", "list_dm_logs"]],
    [WRITE, ["list_campaigns", "get_campaign", "get_campaign_stats", "list_instagram_accounts", "list_posts", "list_dm_logs", "create_campaign", "update_campaign", "pause_campaign", "delete_campaign"]],
    [ALL, ["list_campaigns", "get_campaign", "get_campaign_stats", "list_instagram_accounts", "list_posts", "list_dm_logs", "create_campaign", "update_campaign", "pause_campaign", "activate_campaign", "delete_campaign"]],
  ])("%j", (scopes, names) => {
    expect(listTools(ctx(scopes)).map(tool => tool.name)).toEqual(names);
  });

  it("marks only read tools read-only and delete destructive", () => {
    const tools = listTools(ctx(ALL));
    for (const tool of tools) expect(tool.annotations.readOnlyHint, tool.name).toBe(tool.name.startsWith("list_") || tool.name.startsWith("get_"));
    expect(tools.filter(tool => tool.annotations.destructiveHint).map(tool => tool.name)).toEqual(["delete_campaign"]);
  });

  it("describes create and update with the dashboard's fields, without isActive", () => {
    const tools = Object.fromEntries(listTools(ctx(ALL)).map(tool => [tool.name, tool.inputSchema as { properties: Record<string, unknown>; required?: string[] }]));
    expect(tools.create_campaign.properties).toHaveProperty("dmMessage");
    expect(tools.create_campaign.properties).toHaveProperty("publicReplyMessages");
    expect(tools.create_campaign.properties).not.toHaveProperty("isActive");
    expect(tools.create_campaign.required).toEqual(expect.arrayContaining(["name", "dmMessage"]));
    expect(tools.update_campaign.properties).not.toHaveProperty("isActive");
    expect(tools.update_campaign.properties).not.toHaveProperty("reportShareEnabled");
    expect(tools.update_campaign.required).toEqual(["id"]);
  });

  it.each([
    [READ, "create_campaign", newCampaign],
    [READ, "update_campaign", { id: "c1", name: "x" }],
    [READ, "pause_campaign", { id: "c1" }],
    [READ, "delete_campaign", { id: "c1" }],
    [WRITE, "activate_campaign", { id: "c1" }],
  ])("a %j key cannot call %s", async (scopes, name, args) => {
    await expect(callTool(ctx(scopes), name, args)).rejects.toMatchObject({ status: 403 });
    expect(state.automation.create).not.toHaveBeenCalled();
    expect(state.automation.update).not.toHaveBeenCalled();
    expect(state.automation.delete).not.toHaveBeenCalled();
  });
});

describe("create_campaign", () => {
  it("always creates the campaign paused, in the key's workspace", async () => {
    storeCampaign({ id: "new", workspaceId: "ws", isActive: false });
    const result = await callTool(ctx(WRITE), "create_campaign", newCampaign);
    const data = state.automation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ isActive: false, workspaceId: "ws", instagramAccountId: "acc", keywords: ["DEMO"], matchAnyPost: true, postId: null });
    expect(result).toMatchObject({ id: "new", isActive: false });
    expect(result).not.toHaveProperty("reportShareSlug");
  });

  it("refuses isActive instead of quietly ignoring it", async () => {
    await expect(callTool(ctx(ALL), "create_campaign", { ...newCampaign, isActive: true })).rejects.toMatchObject({ status: 400 });
    expect(state.automation.create).not.toHaveBeenCalled();
  });

  it("applies the dashboard's rules: a post target and keywords are required", async () => {
    await expect(callTool(ctx(WRITE), "create_campaign", { name: "x", dmMessage: "y", keywords: ["A"] }))
      .rejects.toMatchObject({ status: 400, details: { fieldErrors: { postId: expect.any(Array) } } });
    await expect(callTool(ctx(WRITE), "create_campaign", { name: "x", dmMessage: "y", matchAnyPost: true }))
      .rejects.toMatchObject({ status: 400, details: { fieldErrors: { keywords: expect.any(Array) } } });
  });

  it("cannot attach the campaign to another workspace's account", async () => {
    await expect(callTool(ctx(WRITE), "create_campaign", { ...newCampaign, instagramAccountId: "foreign" }))
      .rejects.toMatchObject({ status: 400, message: "Connect Instagram before creating campaigns" });
    expect(state.instagramAccount.findFirst.mock.calls[0][0].where).toEqual({ id: "foreign", workspaceId: "ws" });
  });

  it("is reachable by REST with the same result", async () => {
    storeCampaign({ id: "new", workspaceId: "ws", isActive: false });
    useKey(WRITE);
    const response = await createRest(json("/api/v1/campaigns", "POST", newCampaign));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ id: "new", isActive: false });
  });
});

describe("update_campaign", () => {
  it("edits a paused campaign through the dashboard's own update", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    await callTool(ctx(WRITE), "update_campaign", { id: "c1", dmMessage: "Nuevo", publicReplyEnabled: true, publicReplyMessages: [" Hecho ", ""], trackedDestinationUrl: "https://example.test/a" });
    expect(state.automation.update.mock.calls[0][0]).toEqual({ where: { id: "c1" }, data: { dmMessage: "Nuevo", publicReplyEnabled: true, publicReplyMessages: ["Hecho"], publicReplyMessage: "Hecho" } });
    expect(state.syncLinks.mock.calls[0][1]).toMatchObject({ workspaceId: "ws", automationId: "c1", primaryUrl: "https://example.test/a" });
  });

  it("switching to any post clears the specific post, as in the dashboard", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    await callTool(ctx(WRITE), "update_campaign", { id: "c1", matchAnyPost: true });
    expect(state.automation.update.mock.calls[0][0].data).toEqual({ matchAnyPost: true, postId: null, postUrl: null });
  });

  it("will not edit a live campaign without campaigns:activate", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: true });
    await expect(callTool(ctx(WRITE), "update_campaign", { id: "c1", dmMessage: "Otro" })).rejects.toMatchObject({ status: 403 });
    expect(state.automation.update).not.toHaveBeenCalled();
    await callTool(ctx(ALL), "update_campaign", { id: "c1", dmMessage: "Otro" });
    expect(state.automation.update).toHaveBeenCalledTimes(1);
  });

  it("refuses isActive and report sharing", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    for (const field of [{ isActive: true }, { reportShareEnabled: false }]) {
      await expect(callTool(ctx(ALL), "update_campaign", { id: "c1", ...field })).rejects.toMatchObject({ status: 400 });
    }
    expect(state.automation.update).not.toHaveBeenCalled();
  });

  it("gives 404 for another workspace's campaign, by MCP and REST", async () => {
    storeCampaign({ id: "c1", workspaceId: "other", isActive: false });
    await expect(callTool(ctx(ALL), "update_campaign", { id: "c1", name: "x" })).rejects.toMatchObject({ status: 404 });
    useKey(ALL);
    expect((await patchRest(json("/api/v1/campaigns/c1", "PATCH", { name: "x" }), params("c1"))).status).toBe(404);
    expect(state.automation.update).not.toHaveBeenCalled();
  });
});

describe("activate, pause and delete", () => {
  it("activates only with campaigns:activate", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    await callTool(ctx(ALL), "activate_campaign", { id: "c1" });
    expect(state.automation.update.mock.calls[0][0]).toEqual({ where: { id: "c1" }, data: { isActive: true } });
  });

  it("pauses with either write or activate", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: true });
    await callTool(ctx(WRITE), "pause_campaign", { id: "c1" });
    await callTool(ctx(["campaigns:read", "campaigns:activate"]), "pause_campaign", { id: "c1" });
    expect(state.automation.update.mock.calls.map(call => call[0].data)).toEqual([{ isActive: false }, { isActive: false }]);
  });

  it("deletes only paused campaigns", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: true });
    await expect(callTool(ctx(WRITE), "delete_campaign", { id: "c1" })).rejects.toMatchObject({ status: 409 });
    expect(state.automation.delete).not.toHaveBeenCalled();
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    expect(await callTool(ctx(WRITE), "delete_campaign", { id: "c1" })).toEqual({ deleted: true });
    expect(state.automation.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("never touches another workspace's campaign", async () => {
    storeCampaign({ id: "c1", workspaceId: "other", isActive: false });
    for (const name of ["activate_campaign", "pause_campaign", "delete_campaign"]) {
      await expect(callTool(ctx(ALL), name, { id: "c1" })).rejects.toMatchObject({ status: 404 });
    }
    useKey(ALL);
    expect((await activateRest(json("/api/v1/campaigns/c1/activate", "POST"), params("c1"))).status).toBe(404);
    expect((await deleteRest(json("/api/v1/campaigns/c1", "DELETE"), params("c1"))).status).toBe(404);
    expect(state.automation.update).not.toHaveBeenCalled();
    expect(state.automation.delete).not.toHaveBeenCalled();
  });

  it("refuses activation over REST for a write-only key", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: false });
    useKey(WRITE);
    expect((await activateRest(json("/api/v1/campaigns/c1/activate", "POST"), params("c1"))).status).toBe(403);
    expect(state.automation.update).not.toHaveBeenCalled();
  });
});

describe("reading posts and DM logs", () => {
  it("lists posts with an allowlist and never the token", async () => {
    const result = await callTool(ctx(READ), "list_posts", { limit: 5 });
    expect(state.media).toHaveBeenCalledWith({ context: { provider: "META", accessToken: "plain" }, limit: 5 });
    expect(result).toEqual({ instagramAccountId: "acc", username: "example_account", posts: [{ id: "p1", caption: "Hola", mediaType: "VIDEO", isReel: true, permalink: "https://instagram.com/reel/x", timestamp: "2026-10-01T00:00:00Z", likeCount: null, commentsCount: null }] });
    expect(JSON.stringify(result)).not.toMatch(/plain|enc|cdn/);
  });

  it("lists posts over REST and refuses another workspace's account", async () => {
    expect((await postsRest(json("/api/v1/posts?limit=3", "GET"))).status).toBe(200);
    expect(state.media.mock.calls[0][0].limit).toBe(3);
    expect((await postsRest(json("/api/v1/posts?instagramAccountId=foreign", "GET"))).status).toBe(404);
    expect((await postsRest(json("/api/v1/posts?limit=500", "GET"))).status).toBe(400);
  });

  it("reports a provider failure without its details", async () => {
    state.media.mockRejectedValue(new Error("token EAAB... expired"));
    await expect(callTool(ctx(READ), "list_posts", {})).rejects.toMatchObject({ status: 502, message: "Could not read posts from Instagram" });
  });

  it("reads DM logs of a workspace campaign with a safe selection", async () => {
    storeCampaign({ id: "c1", workspaceId: "ws", isActive: true });
    await callTool(ctx(READ), "list_dm_logs", { id: "c1", status: "FAILED", limit: 10 });
    const query = state.dmLog.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ workspaceId: "ws", automationId: "c1", status: "FAILED" });
    expect(query.take).toBe(10);
    expect(query.select).not.toHaveProperty("commenterId");
    expect(query.select).not.toHaveProperty("commentId");
    expect((await logsRest(json("/api/v1/campaigns/c1/logs?status=NOPE", "GET"), params("c1"))).status).toBe(400);
  });

  it("does not read another workspace's logs", async () => {
    storeCampaign({ id: "c1", workspaceId: "other", isActive: true });
    await expect(callTool(ctx(READ), "list_dm_logs", { id: "c1" })).rejects.toMatchObject({ status: 404 });
    expect(state.dmLog.findMany).not.toHaveBeenCalled();
  });
});

describe("MCP transport", () => {
  it("returns tool errors with their validation details", async () => {
    useKey(WRITE);
    const response = await mcp(json("/api/mcp", "POST", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_campaign", arguments: { name: "x" } } }));
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/^Invalid tool arguments: .*dmMessage/);
  });

  it("refuses a tool the key cannot see", async () => {
    const response = await mcp(json("/api/mcp", "POST", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "activate_campaign", arguments: { id: "c1" } } }));
    expect((await response.json()).result).toMatchObject({ isError: true, content: [{ text: "Missing scope: campaigns:activate" }] });
  });

  it("rejects a revoked key before any tool runs", async () => {
    state.keys.findUnique.mockResolvedValue({ id: "key", workspaceId: "ws", scopes: ALL, expiresAt: new Date("2099-01-01"), revokedAt: new Date() });
    const response = await mcp(json("/api/mcp", "POST", { jsonrpc: "2.0", id: 3, method: "tools/list" }));
    expect(response.status).toBe(401);
  });
});

describe("key scopes", () => {
  beforeEach(() => {
    state.context.mockResolvedValue({ workspaceId: "ws", role: "OWNER" });
    state.keys.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k", ...data }));
  });

  it.each([
    [["campaigns:read"], ["campaigns:read"]],
    [["campaigns:write"], ["campaigns:read", "campaigns:write"]],
    [["campaigns:activate", "campaigns:write"], ["campaigns:read", "campaigns:write", "campaigns:activate"]],
  ])("%j is stored as %j", async (requested, stored) => {
    const response = await createKey(json("/api/integrations/keys", "POST", { name: "Claude", scopes: requested }));
    expect(response.status).toBe(201);
    expect(state.keys.create.mock.calls[0][0].data.scopes).toEqual(stored);
  });

  it("rejects unknown scopes", async () => {
    expect((await createKey(json("/api/integrations/keys", "POST", { name: "Claude", scopes: ["campaigns:send"] }))).status).toBe(400);
    expect(state.keys.create).not.toHaveBeenCalled();
  });
});

describe("the dashboard routes still behave as before", () => {
  beforeEach(() => state.context.mockResolvedValue({ workspaceId: "ws", role: "ADMIN" }));
  const request = (method: string, body: unknown, query = "") =>
    new NextRequest(`https://example.test/api/automations${query}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("creates active by default, as the Go Live button expects", async () => {
    const response = await dashboardCreate(request("POST", newCampaign));
    expect(response.status).toBe(201);
    expect(state.automation.create.mock.calls[0][0].data.isActive).toBe(true);
  });

  it("returns the same error shape for invalid input and missing campaigns", async () => {
    const invalid = await dashboardCreate(request("POST", { name: "x" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ success: false, error: "Invalid input", details: { fieldErrors: expect.any(Object) } });
    storeCampaign({ id: "c1", workspaceId: "other", isActive: true });
    const missing = await dashboardPatch(request("PATCH", { name: "x" }, "?id=c1"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ success: false, error: "Campaign not found" });
  });
});
