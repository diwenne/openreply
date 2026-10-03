/** Destructive test fixtures: use ONLY a disposable loopback database/server. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { hashServiceToken, newServiceToken } from "../lib/integrations/auth";

const base = process.env.TEST_BASE_URL;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!base || !databaseUrl) throw new Error("TEST_BASE_URL and TEST_DATABASE_URL required (disposable local services only)");
for (const address of [base, databaseUrl]) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(address).hostname)) throw new Error("Only loopback test services permitted");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const suffix = randomBytes(8).toString("hex");
const ownerId = `mcp_http_owner_${suffix}`;
const workspaceId = `mcp_http_workspace_${suffix}`;
const token = newServiceToken();
let rpcId = 0;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
async function rpc(method: string, params?: unknown) {
  const response = await fetch(`${base}/api/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return (await response.json()).result;
}

async function main() {
try {
  await db.user.create({ data: { id: ownerId, email: `${suffix}@example.test` } });
  await db.workspace.create({ data: { id: workspaceId, name: "Local HTTP fixture", ownerId } });
  const account = await db.instagramAccount.create({ data: { workspaceId, instagramId: suffix, username: "fixture", accessToken: "dummy-local-only" } });
  const campaign = await db.automation.create({ data: { workspaceId, instagramAccountId: account.id, name: "HTTP example", keywords: ["LINK"], dmMessage: "Local test", isActive: false,
    trackedLinks: { create: { workspaceId, slug: suffix, destinationUrl: "https://example.test/guide", label: "Guide", position: 0 } } } });
  const serviceKey = await db.serviceKey.create({ data: { workspaceId, name: "HTTP fixture", tokenHash: hashServiceToken(token), scopes: ["campaigns:read"], expiresAt: new Date(Date.now() + 86400000) } });
  assert.equal((await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "http-test", version: "1" } })).protocolVersion, "2025-11-25");
  assert.equal((await rpc("tools/list")).tools.length, 3);
  const detail = JSON.parse((await rpc("tools/call", { name: "get_campaign", arguments: { id: campaign.id } })).content[0].text);
  assert.equal(detail.trackedDestinationUrl, "https://example.test/guide");
  assert.equal(detail.secondaryDestinationUrl, null);
  assert.equal(detail.trackedLinks.length, 1);
  assert.equal(detail.reportShareSlug, undefined);
  assert.equal(detail.instagramAccount, undefined);
  const rest = await fetch(`${base}/api/v1/campaigns?id=${campaign.id}`, { headers });
  assert.equal(rest.status, 200);
  assert.deepEqual((await rest.json()).data, detail);
  assert.equal((await fetch(`${base}/api/v1/campaigns`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/campaigns`)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/campaigns?id=not-this-workspace`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/api/v1/campaigns`, { method: "POST", headers, body: "{}" })).status, 403);
  assert.equal((await rpc("tools/call", { name: "create_draft", arguments: {} })).isError, true);
  assert.equal((await fetch(`${base}/api/mcp`, { method: "POST", headers: { ...headers, origin: "https://evil.test" }, body: "{}" })).status, 403);
  assert.equal((await fetch(`${base}/api/mcp`, { method: "POST", headers, body: JSON.stringify({ padding: "x".repeat(65536) }) })).status, 413);
  assert.equal((await db.automation.findUniqueOrThrow({ where: { id: campaign.id } })).isActive, false);
  await db.serviceKey.update({ where: { id: serviceKey.id }, data: { scopes: [] } });
  assert.equal((await fetch(`${base}/api/v1/campaigns`, { headers })).status, 403);
  await db.serviceKey.update({ where: { id: serviceKey.id }, data: { revokedAt: new Date() } });
  assert.equal((await fetch(`${base}/api/v1/campaigns`, { headers })).status, 401);
  await db.serviceKey.update({ where: { id: serviceKey.id }, data: { revokedAt: null, expiresAt: new Date(0) } });
  assert.equal((await fetch(`${base}/api/v1/campaigns`, { headers })).status, 401);
  console.log("PASS: real local HTTP MCP/REST, DB/Redis authentication, scoped details, boundaries, revocation and expiry; no messages sent.");
} finally {
  await db.user.deleteMany({ where: { id: ownerId } });
  await db.$disconnect();
}
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
