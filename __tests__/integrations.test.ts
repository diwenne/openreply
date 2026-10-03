import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  keys: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  campaigns: { findFirst: vi.fn(), findMany: vi.fn() },
  context: vi.fn(), eval: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: { serviceKey: state.keys, automation: state.campaigns } }));
vi.mock("@/lib/workspace-access", () => ({ getCurrentWorkspaceContext: state.context, canManageWorkspace: (role: string) => ["OWNER", "ADMIN"].includes(role) }));
vi.mock("ioredis", () => ({ default: class { status = "ready"; eval = state.eval; listenerCount() { return 1; } } }));

import { authenticateService, hashServiceToken, newServiceToken } from "../lib/integrations/auth";
import { checkOrigin, readJson } from "../lib/integrations/http";
import { getCampaign } from "../lib/integrations/campaigns";
import { callTool, listTools } from "../lib/integrations/mcp";
import { GET as listKeys, POST as createKey, DELETE as revokeKey } from "../app/api/integrations/keys/route";
import { POST as mcp } from "../app/api/mcp/route";
import { GET as rest } from "../app/api/v1/campaigns/route";

const token = `orp_${"a".repeat(43)}`;
const key = { id: "key", workspaceId: "workspace", scopes: ["campaigns:read"], expiresAt: new Date("2099-01-01"), revokedAt: null };
const context = { workspaceId: "workspace", keyId: "key", scopes: ["campaigns:read"] };
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
const request = (body: unknown, extra = {}) => new Request("https://example.test/api/mcp", { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("NEXTAUTH_URL", "https://example.test");
  state.keys.findUnique.mockResolvedValue(key);
  state.keys.update.mockResolvedValue(key);
  state.keys.create.mockImplementation(async ({ data }) => ({ id: "new", name: data.name, scopes: data.scopes, expiresAt: data.expiresAt }));
  state.keys.findMany.mockResolvedValue([]);
  state.keys.updateMany.mockResolvedValue({ count: 1 });
  state.context.mockResolvedValue({ workspaceId: "workspace", role: "ADMIN" });
  state.eval.mockReset().mockResolvedValue(1);
});

describe("service authentication", () => {
  it("generates random secrets and stores lookups by hash only", async () => {
    const a = newServiceToken();
    expect(a).toMatch(/^orp_[A-Za-z0-9_-]{43}$/);
    expect(newServiceToken()).not.toBe(a);
    expect(hashServiceToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(await authenticateService(request({}))).toEqual(context);
    expect(state.keys.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashServiceToken(token) } });
  });
  it.each(["", "Bearer bad", `Bearer ${token} extra`])("rejects invalid header %s before DB", async authorization => {
    await expect(authenticateService(request({}, { authorization }))).rejects.toMatchObject({ status: 401 });
    expect(state.keys.findUnique).not.toHaveBeenCalled();
  });
  it.each([null, { ...key, revokedAt: new Date() }, { ...key, expiresAt: new Date(0) }])("rejects missing, expired or revoked keys", async value => {
    state.keys.findUnique.mockResolvedValue(value);
    await expect(authenticateService(request({}))).rejects.toMatchObject({ status: 401 });
    expect(state.eval).not.toHaveBeenCalled();
  });
  it("bounds requests and fails closed without Redis", async () => {
    state.eval.mockResolvedValueOnce(121);
    await expect(authenticateService(request({}))).rejects.toMatchObject({ status: 429 });
    state.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(authenticateService(request({}))).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("REDIS_URL", "");
    await expect(authenticateService(request({}))).rejects.toMatchObject({ status: 503 });
  });
});

describe("key management", () => {
  it.each([30, 60, 90])("creates a %i-day key with safe one-time output", async days => {
    const before = Date.now();
    const response = await createKey(request({ name: "Reader", scopes: ["campaigns:read"], days }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const output = await response.json();
    expect(output.token).toMatch(/^orp_/);
    expect(output.key.tokenHash).toBeUndefined();
    const input = state.keys.create.mock.calls[0][0];
    expect(input.data.tokenHash).toBe(hashServiceToken(output.token));
    expect(input.data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + days * 86400000);
    expect(input.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + days * 86400000);
    expect(state.keys.update).not.toHaveBeenCalled();
  });
  it("defaults to 30 days", async () => {
    const before = Date.now();
    expect((await createKey(request({ name: "Reader", scopes: ["campaigns:read"] }))).status).toBe(201);
    expect(state.keys.create.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 86400000);
  });
  it.each([0, 91, 365, 1.5])("rejects lifetime %s", async days => {
    expect((await createKey(request({ name: "Reader", scopes: ["campaigns:read"], days }))).status).toBe(400);
    expect(state.keys.create).not.toHaveBeenCalled();
  });
  it.each([null, { workspaceId: "workspace", role: "MEMBER" }])("requires admin access for all management routes", async value => {
    state.context.mockResolvedValue(value);
    expect((await listKeys()).status).toBe(403);
    expect((await createKey(request({}))).status).toBe(403);
    expect((await revokeKey(new Request("https://example.test/api/integrations/keys?id=key"))).status).toBe(403);
  });
  it("rejects write scopes and foreign Origins", async () => {
    expect((await createKey(request({ name: "Reader", scopes: ["campaigns:publish"] }))).status).toBe(400);
    expect((await createKey(request({}, { origin: "https://evil.test" }))).status).toBe(403);
    expect(state.keys.create).not.toHaveBeenCalled();
  });
  it("lists safe workspace metadata and revokes only workspace keys", async () => {
    expect((await listKeys()).status).toBe(200);
    const selected = state.keys.findMany.mock.calls[0][0];
    expect(selected.where).toEqual({ workspaceId: "workspace" });
    expect(selected.select.tokenHash).toBeUndefined();
    expect((await revokeKey(new Request("https://example.test/api/integrations/keys?id=key"))).status).toBe(200);
    expect(state.keys.updateMany.mock.calls[0][0].where).toEqual({ id: "key", workspaceId: "workspace", revokedAt: null });
    state.keys.updateMany.mockResolvedValue({ count: 0 });
    expect((await revokeKey(new Request("https://example.test/api/integrations/keys?id=foreign"))).status).toBe(404);
  });
});

describe("read-only MCP and REST", () => {
  it("retains strict read arguments and deterministic list ordering", async () => {
    await expect(callTool(context, "list_campaigns", { unexpected: true })).rejects.toMatchObject({ status: 400 });
    await expect(callTool(context, "get_campaign", { id: "campaign", unexpected: true })).rejects.toMatchObject({ status: 400 });
    await callTool(context, "list_campaigns", {});
    expect(state.campaigns.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "asc" }] }));
  });
  it("advertises only scoped read-only tools", async () => {
    expect(listTools({ ...context, scopes: [] })).toEqual([]);
    expect(listTools(context).map(tool => tool.name)).toEqual(["list_campaigns", "get_campaign", "get_campaign_stats"]);
    expect(listTools(context).every(tool => tool.annotations.readOnlyHint)).toBe(true);
    await expect(callTool(context, "create_draft", {})).rejects.toMatchObject({ status: 403 });
    await expect(callTool({ ...context, scopes: [] }, "get_campaign", { id: "test" })).rejects.toMatchObject({ status: 403 });
  });
  it("negotiates MCP, handles notifications and rejects unsupported methods", async () => {
    const response = await mcp(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }));
    expect((await response.json()).result.protocolVersion).toBe("2025-11-25");
    expect((await mcp(request({ jsonrpc: "2.0", method: "notifications/initialized" }))).status).toBe(202);
    expect((await (await mcp(request({ jsonrpc: "2.0", id: 2, method: "unknown" }))).json()).error.code).toBe(-32601);
    expect((await mcp(request({ jsonrpc: "2.0", id: 3, method: "ping" }, { "mcp-protocol-version": "invalid" }))).status).toBe(400);
    expect((await mcp(request({}, { accept: "application/json" }))).status).toBe(406);
  });
  it("keeps REST and MCP details identical and non-cached", async () => {
    state.campaigns.findFirst.mockResolvedValue({ id: "campaign", trackedLinks: [{ destinationUrl: "https://example.test/primary", label: "Primary", position: 0 }] });
    const restResponse = await rest(new Request("https://example.test/api/v1/campaigns?id=campaign", { headers }));
    const expected = (await restResponse.json()).data;
    const mcpResponse = await mcp(request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_campaign", arguments: { id: "campaign" } } }));
    expect(JSON.parse((await mcpResponse.json()).result.content[0].text)).toEqual(expected);
    expect(restResponse.headers.get("cache-control")).toBe("no-store");
    expect(mcpResponse.headers.get("cache-control")).toBe("no-store");
    const selection = state.campaigns.findFirst.mock.calls[0][0];
    expect(selection.where).toEqual({ id: "campaign", workspaceId: "workspace" });
    expect(selection.select.trackedLinks.where).toEqual({ workspaceId: "workspace" });
    expect(selection.select.reportShareSlug).toBeUndefined();
    expect(selection.select.instagramAccount).toBeUndefined();
  });
  it("does not leak foreign campaigns or invent missing links", async () => {
    state.campaigns.findFirst.mockResolvedValue(null);
    await expect(getCampaign(context, "foreign")).rejects.toMatchObject({ status: 404 });
    state.campaigns.findFirst.mockResolvedValue({ id: "empty", trackedLinks: [] });
    expect(await getCampaign(context, "empty")).toMatchObject({ trackedDestinationUrl: null, secondaryDestinationUrl: null, trackedLinks: [] });
  });
});

describe("request boundaries", () => {
  it("enforces Origin while permitting non-browser clients", () => {
    expect(() => checkOrigin(request({}))).not.toThrow();
    expect(() => checkOrigin(request({}, { origin: "https://evil.test" }))).toThrow("Origin not allowed");
  });
  it("bounds chunked JSON independent of Content-Length", async () => {
    await expect(readJson(request({ padding: "x".repeat(65536) }))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request({}, { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
});
