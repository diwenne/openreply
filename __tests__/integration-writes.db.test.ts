import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  context: { workspaceId: "workspace", keyId: "test-key", scopes: ["campaigns:read", "drafts:write", "events:read", "conversions:write"] },
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/integrations/auth", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/integrations/auth")>(),
  authenticateService: async () => state.context,
}));
import { createDraft, getCampaign } from "../lib/integrations/campaigns";
import { callTool, listTools } from "../lib/integrations/mcp";
import { POST as convert } from "../app/api/v1/conversions/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `integration_writes_${randomBytes(5).toString("hex")}`;
let sql: Client;
const draft = {
  name: "Example draft", instagramAccountId: "account", keywords: ["LINK"],
  dmMessage: "Your resource {link}", trackedDestinationUrl: "https://example.test/resource",
  openingDmEnabled: true, openingDmMessage: "Continue", openingDmButtonLabel: "Open",
  idempotencyKey: "draft-example-001", workspaceId: "other", isActive: true, lifecycle: "ACTIVE",
};
const request = (body: unknown, origin?: string) => new Request("https://example.test/api/v1/conversions", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
});

describe.skipIf(!databaseUrl)("scoped integration writes on real PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://example.test");
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const name of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
      await sql.query(readFileSync(path.join(root, name, "migration.sql"), "utf8"));
    }
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "owner", email: "writes@example.test" } });
    for (const id of ["workspace", "other"]) {
      await state.db.workspace.create({ data: { id, ownerId: "owner", name: id } });
      await state.db.instagramAccount.create({ data: { id: id === "workspace" ? "account" : "other_account", workspaceId: id, instagramId: id, username: id, accessToken: "dummy-local-only" } });
    }
  }, 60_000);
  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) { await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await sql.end(); }
    vi.unstubAllEnvs();
  });

  it("serializes retries into one inactive draft, one event and one complete revision", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => createDraft(state.context, draft)));
    expect(new Set(results.map(result => result.campaignId)).size).toBe(1);
    expect(results.filter(result => !result.replayed)).toHaveLength(1);
    const campaignId = results[0].campaignId;
    const campaign = await state.db.automation.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign).toMatchObject({ workspaceId: "workspace", lifecycle: "DRAFT", isActive: false, armedAt: null, version: 1 });
    expect(await state.db.integrationEvent.count({ where: { workspaceId: "workspace", externalId: "draft:draft-example-001" } })).toBe(1);
    const revisions = await state.db.campaignRevision.findMany({ where: { automationId: campaignId } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].snapshot).toMatchObject({ lifecycle: "DRAFT", version: 1, trackedLinks: [{ destinationUrl: draft.trackedDestinationUrl }] });
    expect((await getCampaign(state.context, campaignId)).trackedDestinationUrl).toBe(draft.trackedDestinationUrl);
    await expect(createDraft(state.context, { ...draft, dmMessage: "Changed" })).rejects.toMatchObject({ status: 409 });
  });

  it("checks scopes/account ownership, does not guess links and rolls back invalid attempts", async () => {
    await expect(createDraft({ ...state.context, scopes: ["campaigns:read"] }, draft)).rejects.toMatchObject({ status: 403 });
    const before = await state.db.automation.count();
    await expect(createDraft(state.context, { ...draft, instagramAccountId: "other_account", idempotencyKey: "foreign-attempt" })).rejects.toMatchObject({ status: 404 });
    expect(await state.db.automation.count()).toBe(before);
    const empty = await createDraft(state.context, { name: "Unbound", instagramAccountId: "account", idempotencyKey: "empty-draft-key" });
    expect(await getCampaign(state.context, empty.campaignId)).toMatchObject({ postId: null, trackedDestinationUrl: null, trackedLinks: [] });
  });

  it("does not resurrect deleted drafts under a previously used idempotency key", async () => {
    const input = { ...draft, idempotencyKey: "deleted-draft-key" };
    const created = await createDraft(state.context, input);
    await state.db.automation.delete({ where: { id: created.campaignId } });
    await expect(createDraft(state.context, input)).rejects.toMatchObject({ status: 409 });
  });

  it("MCP scopes remain opt-in and the draft tool cannot activate campaigns", async () => {
    expect(listTools({ ...state.context, scopes: ["campaigns:read"] })).toHaveLength(3);
    expect(listTools(state.context)).toHaveLength(5);
    const result = await callTool(state.context, "create_draft", { ...draft, idempotencyKey: "mcp-draft-key" }) as { campaignId: string };
    expect((await state.db.automation.findUniqueOrThrow({ where: { id: result.campaignId } })).isActive).toBe(false);
    await expect(callTool(state.context, "publish_campaign", { id: result.campaignId })).rejects.toMatchObject({ status: 404 });
    expect(await state.db.deliveryEvent.count()).toBe(0);
  });

  it("records one conversion for concurrent retries and rejects changed payload or foreign campaign", async () => {
    const created = await createDraft(state.context, { ...draft, idempotencyKey: "conversion-draft" });
    const event = { campaignId: created.campaignId, externalId: "conversion-event-001", type: "form_completed", subjectRef: "opaque-reference" };
    const responses = await Promise.all([convert(request(event)), convert(request(event)), convert(request(event))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 200, 201]);
    expect(await state.db.integrationEvent.count({ where: { workspaceId: "workspace", eventType: "conversion.form_completed" } })).toBe(1);
    expect((await convert(request({ ...event, value: 42 }))).status).toBe(409);
    expect((await convert(request({ ...event, campaignId: "nonexistent", externalId: "conversion-other" }))).status).toBe(404);
    expect((await convert(request(event, "https://evil.test"))).status).toBe(403);
    expect((await convert(request({ ...event, extra: "not accepted" }))).status).toBe(400);
    state.context.scopes = ["campaigns:read"];
    try { expect((await convert(request(event))).status).toBe(403); }
    finally { state.context.scopes = ["campaigns:read", "drafts:write", "events:read", "conversions:write"]; }
  });
});
