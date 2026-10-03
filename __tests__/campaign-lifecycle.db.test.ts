/** Real PostgreSQL migration + API tests. Only random throwaway schema; no
 * production credentials, provider sends, queue jobs or persistent test data. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/app/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient, workspaceId: "ws", authorized: true, role: "OWNER" }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => state.authorized ? state.workspaceId : null }));
vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
  getCurrentWorkspaceContext: async () => state.authorized ? { userId: "owner", workspaceId: state.workspaceId, role: state.role } : null,
}));
import { POST, PATCH } from "@/app/api/automations/route";
import { POST as simulate } from "@/app/api/automations/validate/route";
import { duplicateCampaign } from "@/lib/campaigns/duplicate";
import { POST as importCampaigns } from "@/app/api/automations/import/route";
import { createLibraryDraft } from "@/lib/library/drafts";
import { POST as saveLibrary } from "@/app/api/library/route";
import { GET as editorHistory } from "@/app/api/automations/history/route";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");
const EXTENSION = "20261003090000_creator_workflow";
const schema = `campaign_lifecycle_${randomBytes(6).toString("hex")}`;
let sql: Client;
function request(method: string, body: unknown, id?: string) {
  return new NextRequest(`http://localhost/api/automations${id ? `?id=${id}` : ""}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const complete = { name: "Ready", instagramAccountId: "account", matchAnyPost: true, keywords: ["link"], dmMessage: "Here is {link}", trackedDestinationUrl: "https://example.test/resource" };
async function create(body: unknown) { const response = await POST(request("POST", body)); return { response, payload: await response.json() }; }

describe.skipIf(!DATABASE_URL)("campaign lifecycle on real PostgreSQL", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: DATABASE_URL });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    for (const dir of dirs.filter((d) => d < EXTENSION)) await sql.query(readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
    await sql.query(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('owner','owner@example.test',now()),('other','other@example.test',now());
      INSERT INTO "Workspace" ("id","name","ownerId","updatedAt") VALUES ('ws','Test','owner',now()),('otherws','Other','other',now());
      INSERT INTO "InstagramAccount" ("id","workspaceId","instagramId","username","accessToken","updatedAt") VALUES
        ('account','ws','ig-test','test','dummy',now()),('legacy-account','ws','ig-legacy','legacy','dummy',now()),('otheraccount','otherws','ig-other','other','dummy',now());
      INSERT INTO "Automation" ("id","workspaceId","instagramAccountId","name","keywords","dmMessage","isActive","pendingNextReel","createdAt","updatedAt") VALUES
        ('legacy-active','ws','legacy-account','Active','{link}','text',true,true,'2026-01-01',now()),
        ('legacy-overlap','ws','legacy-account','Also active','{link}','text',true,true,'2026-02-01',now()),
        ('legacy-paused','ws','legacy-account','Paused','{link}','text',false,true,'2026-01-01',now());
    `);
    for (const dir of dirs.filter((d) => d >= EXTENSION)) await sql.query(readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 6 }, { schema }) });
  }, 60_000);
  beforeEach(() => { state.authorized = true; state.role = "OWNER"; state.workspaceId = "ws"; });
  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) { await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await sql.end(); }
  });

  it("preserves active/paused state and legacy overlaps without guessing", async () => {
    const rows = await state.db.automation.findMany({ where: { instagramAccountId: "legacy-account" }, orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.id, r.lifecycle, r.isActive, r.pendingNextReel])).toEqual([
      ["legacy-active", "ACTIVE", true, true], ["legacy-overlap", "ACTIVE", true, true], ["legacy-paused", "PAUSED", false, true],
    ]);
    expect(rows[0].armedAt).toEqual(rows[0].createdAt);
    expect(rows[2].armedAt).toBeNull();
  });
  it("saves an incomplete draft but rejects activating it until complete", async () => {
    const { response, payload } = await create({ name: "Incomplete", instagramAccountId: "account", lifecycle: "DRAFT" });
    expect(response.status).toBe(201);
    expect(payload.data).toMatchObject({ lifecycle: "DRAFT", isActive: false, dmMessage: "" });
    const rejected = await PATCH(request("PATCH", { lifecycle: "ACTIVE" }, payload.data.id));
    expect(rejected.status).toBe(400);
    expect((await state.db.automation.findUniqueOrThrow({ where: { id: payload.data.id } })).lifecycle).toBe("DRAFT");
    const accepted = await PATCH(request("PATCH", { lifecycle: "ACTIVE", matchAnyPost: true, keywords: ["link"], dmMessage: "Ready" }, payload.data.id));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data).toMatchObject({ lifecycle: "ACTIVE", isActive: true, version: 2 });
  });
  it("serializes concurrent create/activation: exactly one armed reel", async () => {
    const waiting = { ...complete, matchAnyPost: false, pendingNextReel: true };
    const results = await Promise.all([create(waiting), create(waiting), create(waiting)]);
    expect(results.map((r) => r.response.status).sort()).toEqual([201,409,409]);
    const armed = await state.db.automation.findMany({ where: { instagramAccountId: "account", pendingNextReel: true, isActive: true } });
    expect(armed).toHaveLength(1);
    expect(armed[0].armedAt!.getTime()).toBeGreaterThan(Date.now() - 10_000);
    const drafts = await Promise.all([create({ ...waiting, lifecycle: "DRAFT" }), create({ ...waiting, lifecycle: "DRAFT" })]);
    await PATCH(request("PATCH", { lifecycle: "PAUSED" }, armed[0].id));
    const activations = await Promise.all(drafts.map((r) => PATCH(request("PATCH", { lifecycle: "ACTIVE" }, r.payload.data.id))));
    expect(activations.map((r) => r.status).sort()).toEqual([200,409]);
    const currentlyActive = await state.db.automation.findFirstOrThrow({ where: { instagramAccountId: "account", pendingNextReel: true, isActive: true } });
    await PATCH(request("PATCH", { lifecycle: "PAUSED" }, currentlyActive.id));
  });
  it("archives without deleting tracking links/report slug and records versions", async () => {
    const { payload } = await create(complete);
    const before = await state.db.trackedLink.findMany({ where: { automationId: payload.data.id } });
    const response = await PATCH(request("PATCH", { lifecycle: "ARCHIVED", isActive: true }, payload.data.id));
    expect(response.status).toBe(200);
    const archived = (await response.json()).data;
    expect(archived).toMatchObject({ lifecycle: "ARCHIVED", isActive: false, reportShareSlug: payload.data.reportShareSlug });
    expect(await state.db.trackedLink.findMany({ where: { automationId: archived.id } })).toEqual(before);
    const revisions = await state.db.campaignRevision.findMany({ where: { automationId: archived.id }, orderBy: { createdAt: "asc" } });
    expect(revisions).toHaveLength(2);
    expect(revisions[1].snapshot).toMatchObject({ lifecycle: "ARCHIVED", version: 2, trackedLinks: [{ destinationUrl: "https://example.test/resource" }] });
    const copy = await duplicateCampaign({ automationId: archived.id, workspaceId: "ws", actorId: "owner" });
    expect(copy).toMatchObject({ lifecycle: "DRAFT", isActive: false, armedAt: null, version: 1 });
    expect(await state.db.campaignRevision.count({ where: { automationId: copy!.id } })).toBe(1);
  });
  it("preserves worker button ordering in recorded history when link positions tie", async () => {
    const { payload } = await create({ ...complete, trackedDestinationUrl: undefined });
    const campaignId = payload.data.id;
    await state.db.trackedLink.createMany({ data: [
      { id: "z-older-link", workspaceId: "ws", automationId: campaignId, position: 0, slug: "older-tie", destinationUrl: "https://example.test/older", createdAt: new Date("2026-01-01") },
      { id: "a-newer-link", workspaceId: "ws", automationId: campaignId, position: 0, slug: "newer-tie", destinationUrl: "https://example.test/newer", createdAt: new Date("2026-02-01") },
    ] });
    expect((await PATCH(request("PATCH", { goal: "Ordering" }, campaignId))).status).toBe(200);
    const revision = await state.db.campaignRevision.findFirstOrThrow({ where: { automationId: campaignId }, orderBy: { createdAt: "desc" } });
    expect(revision.snapshot).toMatchObject({ trackedLinks: [
      { destinationUrl: "https://example.test/older" }, { destinationUrl: "https://example.test/newer" },
    ] });
  });
  it("enforces workspace and role isolation", async () => {
    state.authorized = false;
    expect((await POST(request("POST", complete))).status).toBe(401);
    state.authorized = true; state.role = "MEMBER";
    expect((await POST(request("POST", complete))).status).toBe(403);
    state.role = "OWNER";
    expect((await create({ ...complete, instagramAccountId: "otheraccount" })).response.status).toBe(400);
    expect((await PATCH(request("PATCH", { name: "unauthorized" }, "not-in-workspace"))).status).toBe(404);
  });
  it("simulation uses new proposed links and shared winner logic without persistence", async () => {
    const { payload } = await create({ ...complete, name: "Specific", postId: "post", matchAnyPost: false });
    const before = await state.db.campaignRevision.count();
    const result = await simulate(request("POST", {
      instagramAccountId: "account", kind: "comment", text: "link", mediaId: "post",
      candidate: { ...complete, id: payload.data.id, name: "Edited", postId: "post", matchAnyPost: false, trackedDestinationUrl: "https://example.test/NEW" },
    }));
    expect(result.status).toBe(200);
    const data = (await result.json()).data;
    expect(data.winner.name).toBe("Edited");
    expect(data.message).toContain("https://example.test/NEW");
    expect(data.message).not.toContain("/r/");
    expect(await state.db.campaignRevision.count()).toBe(before);
    expect(await state.db.dmLog.count()).toBe(0);
  });
  it("rejects executable and credential-bearing URLs", async () => {
    for (const trackedDestinationUrl of ["javascript:alert(1)", "data:text/html,evil", "https://user:pass@example.com/"]) expect((await create({ ...complete, trackedDestinationUrl })).response.status).toBe(400);
  });
  it("imports true, false and unspecified source states as drafts with revisions", async () => {
    const response = await importCampaigns(request("POST", { instagramAccountId: "account", campaigns: [
      { postId: "import-explicit-active", name: "Source active", keywords: ["link"], dmMessage: "Import content", isActive: true },
      { postId: "import-unspecified-status", name: "Source unspecified", keywords: ["link"], dmMessage: "Import content" },
      { postId: "import-explicit-paused", name: "Source paused", keywords: ["link"], dmMessage: "Import content", isActive: false },
    ] }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toContain("Imported as drafts");
    expect(payload.data.created).toHaveLength(3);
    expect(payload.data.created.every((row: { lifecycle: string }) => row.lifecycle === "DRAFT")).toBe(true);
    const rows = await state.db.automation.findMany({ where: { postId: { in: ["import-explicit-active", "import-unspecified-status", "import-explicit-paused"] } } });
    expect(rows).toHaveLength(3);
    for (const campaign of rows) {
      expect(campaign).toMatchObject({ lifecycle: "DRAFT", isActive: false, armedAt: null, version: 1 });
      const revisions = await state.db.campaignRevision.findMany({ where: { automationId: campaign.id } });
      expect(revisions).toHaveLength(1);
      expect(revisions[0].snapshot).toMatchObject({ lifecycle: "DRAFT", isActive: false });
    }
    expect(await state.db.dmLog.count({ where: { automationId: { in: rows.map((r) => r.id) } } })).toBe(0);
  });

  it("retries library copies once with immutable initial link snapshots", async () => {
    const context = { workspaceId: "ws", actorId: "owner" };
    const input = { ...complete, idempotencyKey: "library-retry", secondaryDestinationUrl: "https://example.test/secondary" };
    const results = await Promise.all([createLibraryDraft(context, input), createLibraryDraft(context, input), createLibraryDraft(context, input)]);
    expect(new Set(results.map(r => r.campaignId)).size).toBe(1);
    expect(results.filter(r => !r.replayed)).toHaveLength(1);
    const id = results[0].campaignId;
    const initial = await state.db.campaignRevision.findFirstOrThrow({ where: { automationId: id } });
    expect(initial.snapshot).toMatchObject({ version: 1, lifecycle: "DRAFT", isActive: false, postId: null, trackedLinks: [
      { destinationUrl: complete.trackedDestinationUrl, position: 0 }, { destinationUrl: "https://example.test/secondary", position: 1 },
    ] });
    expect((await PATCH(request("PATCH", { trackedDestinationUrl: "https://example.test/new" }, id))).status).toBe(200);
    expect((await state.db.campaignRevision.findUniqueOrThrow({ where: { id: initial.id } })).snapshot).toEqual(initial.snapshot);
    await expect(createLibraryDraft(context, { ...input, name: "Changed" })).rejects.toMatchObject({ status: 409 });
    await expect(createLibraryDraft(context, { ...input, idempotencyKey: "foreign-account", instagramAccountId: "otheraccount" })).rejects.toMatchObject({ status: 404 });
    expect(await state.db.dmLog.count({ where: { automationId: id } })).toBe(0);
  });
  it("saves safe library content, enforces versions and does not modify existing drafts", async () => {
    const make = (body: unknown) => new Request("http://localhost/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const first = await saveLibrary(make({ action: "save", kind: "RESOURCE", name: "Resource", data: {
      destinationUrl: "https://example.test/original", dmMessage: "Here {link}", category: "COMPANY", accessToken: "do-not-store",
    } }));
    expect(first.status).toBe(201);
    const asset = (await first.json()).asset;
    expect(asset.data).not.toHaveProperty("accessToken");
    const copy = await saveLibrary(make({ action: "create_draft", id: asset.id, instagramAccountId: "account", keyword: "guide", idempotencyKey: "resource-copy" }));
    expect(copy.status).toBe(200);
    const id = (await copy.json()).campaignId;
    const edit = { action: "save", id: asset.id, kind: "RESOURCE", name: "Edited", version: 1, data: { destinationUrl: "https://example.test/updated" } };
    expect((await saveLibrary(make(edit))).status).toBe(200);
    expect((await saveLibrary(make(edit))).status).toBe(409);
    expect(await state.db.trackedLink.findFirst({ where: { automationId: id } })).toMatchObject({ destinationUrl: "https://example.test/original" });
    state.role = "MEMBER";
    expect((await saveLibrary(make(edit))).status).toBe(403);
    state.role = "OWNER"; state.workspaceId = "otherws";
    expect((await saveLibrary(make({ action: "create_draft", id: asset.id, instagramAccountId: "otheraccount", idempotencyKey: "foreign-copy" }))).status).toBe(404);
  });
  it("returns only recorded sanitized revisions within the owning workspace", async () => {
    const { payload } = await create(complete);
    await state.db.campaignRevision.create({ data: { workspaceId: "ws", automationId: payload.data.id,
      actorId: "owner", snapshot: { version: 2, name: "Recorded", accessToken: "private-token", recipientId: "private-recipient",
        trackedLinks: [{ destinationUrl: "https://example.test/recorded", position: 0, slug: "private-slug" }] } } });
    const response = await editorHistory(new NextRequest(`http://localhost/api/automations/history?id=${payload.data.id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = JSON.stringify(await response.json());
    for (const value of ["private-token", "private-recipient", "private-slug"]) expect(text).not.toContain(value);
    state.workspaceId = "otherws";
    expect((await editorHistory(new NextRequest(`http://localhost/api/automations/history?id=${payload.data.id}`))).status).toBe(404);
    state.authorized = false;
    expect((await editorHistory(new NextRequest("http://localhost/api/automations/history?id=test"))).status).toBe(401);
  });
});
