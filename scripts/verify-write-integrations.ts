/** Dummy fixtures only. Never use a production database, even via a tunnel. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
  const base = process.env.TEST_BASE_URL ?? "";
  for (const value of [databaseUrl, base]) {
    if (!value || !["localhost", "127.0.0.1"].includes(new URL(value).hostname)) throw new Error("Disposable loopback services required");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const suffix = randomBytes(8).toString("hex");
  const owners: string[] = [];
  const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
  try {
    async function fixture(index: number) {
      const owner = await db.user.create({ data: { email: `writes-${suffix}-${index}@example.test` } }); owners.push(owner.id);
      const workspace = await db.workspace.create({ data: { ownerId: owner.id, name: "Local integration fixture", members: { create: { userId: owner.id, role: "OWNER" } } } });
      const account = await db.instagramAccount.create({ data: { workspaceId: workspace.id, instagramId: `${suffix}-${index}`, username: "fixture", accessToken: "DUMMY-LOCAL-ONLY" } });
      const sessionToken = randomBytes(32).toString("base64url");
      await db.session.create({ data: { userId: owner.id, sessionToken, expires: new Date(Date.now() + 3600000) } });
      return { workspace, account, cookie: `authjs.session-token=${sessionToken}` };
    }
    const first = await fixture(1), second = await fixture(2);
    async function session(path: string, body?: unknown) {
      return fetch(base + path, { ...(body === undefined ? {} : post(body)), headers: { Cookie: first.cookie, Origin: base, "Content-Type": "application/json" } });
    }
    const page = await session("/integrations");
    assert.equal(page.status, 200);
    const html = await page.text();
    for (const days of [30, 60, 90]) assert.ok(html.includes(`value="${days}"`));
    assert.ok(html.includes("drafts:write"));
    const response = await session("/api/integrations/keys", { name: "Dummy acceptance", scopes: ["campaigns:read", "drafts:write", "events:read", "conversions:write"] });
    assert.equal(response.status, 201);
    const { token, key } = await response.json();
    const originalExpiry = new Date(key.expiresAt).getTime();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    let rpcId = 0;
    async function rpc(method: string, params?: unknown) {
      const response = await fetch(base + "/api/mcp", { ...post({ jsonrpc: "2.0", id: ++rpcId, method, params }), headers });
      assert.equal(response.status, 200);
      return (await response.json()).result;
    }
    assert.equal((await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "local-test", version: "1" } })).protocolVersion, "2025-11-25");
    assert.equal((await rpc("tools/list")).tools.length, 5);
    const draft = { name: "Example resource", instagramAccountId: first.account.id, keywords: ["LINK"], dmMessage: "Your resource {link}",
      trackedDestinationUrl: "https://example.test/resource", idempotencyKey: `draft-${suffix}`, isActive: true, lifecycle: "ACTIVE", workspaceId: second.workspace.id };
    const responses = await Promise.all(Array.from({ length: 3 }, () => fetch(base + "/api/v1/campaigns", { ...post(draft), headers })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 201]);
    const created = await Promise.all(responses.map(r => r.json()));
    assert.equal(new Set(created.map(value => value.campaignId)).size, 1);
    const campaignId = created[0].campaignId;
    const campaign = await db.automation.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(campaign.workspaceId, first.workspace.id); assert.equal(campaign.lifecycle, "DRAFT"); assert.equal(campaign.isActive, false);
    assert.equal(await db.campaignRevision.count({ where: { automationId: campaignId } }), 1);
    assert.equal((await fetch(base + "/api/v1/campaigns", { ...post({ ...draft, dmMessage: "Changed" }), headers })).status, 409);
    assert.equal((await fetch(base + "/api/v1/campaigns", { ...post({ ...draft, instagramAccountId: second.account.id, idempotencyKey: `foreign-${suffix}` }), headers })).status, 404);
    const mcpDraft = await rpc("tools/call", { name: "create_draft", arguments: { ...draft, idempotencyKey: `mcp-${suffix}` } });
    assert.ok(!mcpDraft.isError);
    const mcpDetails = await rpc("tools/call", { name: "get_campaign", arguments: { id: campaignId } });
    assert.equal(JSON.parse(mcpDetails.content[0].text).trackedDestinationUrl, draft.trackedDestinationUrl);
    const conversion = { campaignId, externalId: `conversion-${suffix}`, type: "form_completed", subjectRef: "opaque-local-reference" };
    const conversions = await Promise.all(Array.from({ length: 3 }, () => fetch(base + "/api/v1/conversions", { ...post(conversion), headers })));
    assert.deepEqual(conversions.map(r => r.status).sort(), [200, 200, 201]);
    assert.equal(await db.integrationEvent.count({ where: { workspaceId: first.workspace.id, eventType: "conversion.form_completed" } }), 1);
    assert.equal((await fetch(base + "/api/v1/conversions", { ...post({ ...conversion, value: 10 }), headers })).status, 409);
    await db.integrationEvent.updateMany({ where: { workspaceId: first.workspace.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const foreignEvent = await db.integrationEvent.create({ data: { workspaceId: second.workspace.id, eventType: "fixture.foreign", payload: {}, createdAt: new Date(Date.now() - 60_000) } });
    const feed = await fetch(base + "/api/v1/events?since=" + encodeURIComponent(new Date(Date.now() - 120_000).toISOString()), { headers });
    assert.equal(feed.status, 200);
    const feedBody = await feed.json();
    assert.ok(feedBody.events.some((event: { type: string }) => event.type === "conversion.form_completed"));
    assert.ok(!feedBody.events.some((event: { eventId: string }) => event.eventId === `i:${foreignEvent.id}`));
    assert.equal(feed.headers.get("cache-control"), "no-store");
    const historyResponse = await session("/api/campaigns/history?id=" + encodeURIComponent(campaignId));
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.deepEqual(history.data.conversions, [{ eventType: "conversion.form_completed", count: 1 }]);
    assert.ok(!JSON.stringify(history).includes("opaque-local-reference"));
    const readOnlyResponse = await session("/api/integrations/keys", { name: "Readonly fixture", scopes: ["campaigns:read"], days: 90 });
    assert.equal(readOnlyResponse.status, 201);
    const readonly = await readOnlyResponse.json();
    assert.equal((await fetch(base + "/api/v1/campaigns", { ...post(draft), headers: { ...headers, Authorization: `Bearer ${readonly.token}` } })).status, 403);
    assert.equal((await fetch(base + "/api/v1/events", { headers: { ...headers, Authorization: `Bearer ${readonly.token}` } })).status, 403);
    assert.equal((await db.serviceKey.findUniqueOrThrow({ where: { id: key.id } })).expiresAt.getTime(), originalExpiry);
    assert.equal(await db.deliveryEvent.count({ where: { workspaceId: first.workspace.id } }), 0);
    assert.equal((await fetch(base + "/api/v1/conversions", { ...post(conversion), headers: { ...headers, Origin: "https://evil.test" } })).status, 403);
    await db.serviceKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    assert.equal((await fetch(base + "/api/v1/campaigns", { headers })).status, 401);
    console.log("PASS: real local sessions/HTTP MCP/REST, idempotent inactive drafts and conversions, scopes, workspace isolation, unchanged old key expiry and revocation; no messages sent.");
  } finally {
    await db.user.deleteMany({ where: { id: { in: owners } } });
    await db.$disconnect();
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Acceptance failed"); process.exitCode = 1; });
