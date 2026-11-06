/**
 * Tracked link (DM button) order, tested against a real Postgres.
 *
 * The bug these tests guard against lives in Postgres itself: links saved in
 * one request share a createdAt, and Postgres returns tied rows in whatever
 * order its sort and the rows' place on disk produce. No mock reproduces that,
 * so this suite needs a database and is skipped without one:
 *
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
 *     npx vitest run __tests__/tracked-link-order.db.test.ts
 *
 * Each run builds the schema from prisma/migrations inside its own throwaway
 * Postgres schema and drops it at the end, so it never touches existing data.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");
const POSITION_MIGRATION = "20260917160000_tracked_link_position";

const PRIMARY = "https://example.com/primary";
const SECOND = "https://example.com/second";
const THIRD = "https://example.com/third";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  workspaceId: "",
}));

vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock("@/lib/auth", () => ({
  getCurrentWorkspaceId: async () => state.workspaceId,
}));
vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: () => true,
  getCurrentWorkspaceContext: async () => ({
    userId: "user_test",
    workspaceId: state.workspaceId,
    role: "OWNER",
  }),
}));

import { GET, PATCH, POST } from "../app/api/automations/route";
import { duplicateCampaign } from "../lib/campaigns/duplicate";
import { TRACKED_LINK_ORDER } from "../lib/tracking/link-order";

const schema = `tracked_link_order_${randomBytes(4).toString("hex")}`;
let sql: Client;

// Ids for the legacy rows, chosen so byte order matches creation order.
const T0 = "2026-05-01 10:00:00.000";
const T1 = "2026-05-01 10:05:00.000";
const legacy = {
  tiedCampaign: "cmlegacytied00000000000001",
  tiedFirst: "cmlegacytied00000000000a01",
  tiedSecond: "cmlegacytied00000000000a02",
  distinctCampaign: "cmlegacydist00000000000001",
  // Created first but with an id that sorts last: createdAt must win.
  distinctFirst: "cmlegacydist00000000000z99",
  distinctSecond: "cmlegacydist00000000000a01",
  threeCampaign: "cmlegacythree0000000000001",
  threeFirst: "cmlegacythree0000000000b01",
  threeSecond: "cmlegacythree0000000000b02",
  threeThird: "cmlegacythree0000000000b03",
  singleCampaign: "cmlegacysingle000000000001",
  singleOnly: "cmlegacysingle000000000c01",
  emptyCampaign: "cmlegacyempty0000000000001",
};

function migrationDirs() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string) {
  return readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

function jsonRequest(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createCampaign(name: string, links: { primary?: string; second?: string }) {
  const res = await POST(
    jsonRequest("POST", "http://localhost/api/automations", {
      name,
      instagramAccountId: accountId,
      matchAnyPost: true,
      keywords: ["LINK"],
      dmMessage: "Here you go",
      linkButtonLabel: "Get offer",
      trackedDestinationUrl: links.primary ?? "",
      secondaryDestinationUrl: links.second ?? "",
      secondaryButtonLabel: "Read the guide",
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}

// The body the campaign builder sends on every save.
async function saveCampaign(
  id: string,
  links: { primary: string; second: string; secondLabel?: string }
) {
  const res = await PATCH(
    jsonRequest("PATCH", `http://localhost/api/automations?id=${id}`, {
      name: "Saved",
      matchAnyPost: true,
      pendingNextReel: false,
      matchAnyWord: false,
      keywords: ["LINK"],
      dmMessage: "Here you go",
      trackedDestinationUrl: links.primary,
      linkButtonLabel: "Get offer",
      secondaryDestinationUrl: links.second,
      secondaryButtonLabel: links.secondLabel ?? "Read the guide",
      isActive: true,
    })
  );
  expect(res.status).toBe(200);
}

async function storedLinks(automationId: string) {
  return state.db.trackedLink.findMany({
    where: { automationId },
    orderBy: TRACKED_LINK_ORDER,
    select: { label: true, destinationUrl: true, position: true },
  });
}

// Rewrites a campaign's older links in place. Postgres writes an updated row
// to a new spot on disk, which is what edits do to a real database over time,
// and it is what exposes an ORDER BY that relies on ties.
async function moveOlderLinksOnDisk(automationId: string) {
  await sql.query(
    `UPDATE "TrackedLink" SET "destinationUrl" = "destinationUrl"
     WHERE "automationId" = $1 AND "position" = 0`,
    [automationId]
  );
}

let accountId = "";

describe.skipIf(!DATABASE_URL)("tracked link order on a real Postgres", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: DATABASE_URL });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);

    // The database as it was just before this change.
    const dirs = migrationDirs();
    expect(dirs).toContain(POSITION_MIGRATION);
    for (const dir of dirs.filter((d) => d < POSITION_MIGRATION)) {
      await sql.query(migrationSql(dir));
    }

    await sql.query(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('user_test', 'order@test.dev', now());
      INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt")
        VALUES ('workspace_test', 'Order', 'user_test', now());
      INSERT INTO "InstagramAccount" ("id", "workspaceId", "instagramId", "username", "accessToken", "updatedAt")
        VALUES ('account_test', 'workspace_test', 'ig_order_test', 'order', 'token', now());
      INSERT INTO "Automation" ("id", "workspaceId", "instagramAccountId", "name", "keywords", "dmMessage", "matchAnyPost", "linkButtonLabel", "updatedAt")
      VALUES
        ('${legacy.tiedCampaign}', 'workspace_test', 'account_test', 'Tied', '{LINK}', 'hi', true, 'Get offer', now()),
        ('${legacy.distinctCampaign}', 'workspace_test', 'account_test', 'Distinct', '{LINK}', 'hi', true, 'Get offer', now()),
        ('${legacy.threeCampaign}', 'workspace_test', 'account_test', 'Three', '{LINK}', 'hi', true, 'Get offer', now()),
        ('${legacy.singleCampaign}', 'workspace_test', 'account_test', 'Single', '{LINK}', 'hi', true, 'Get offer', now()),
        ('${legacy.emptyCampaign}', 'workspace_test', 'account_test', 'Empty', '{LINK}', 'hi', true, 'Get offer', now());
    `);

    // Legacy links, inserted in scrambled order so that physical order and
    // intended order disagree before the migration runs.
    await sql.query(`
      INSERT INTO "TrackedLink" ("id", "workspaceId", "automationId", "slug", "label", "destinationUrl", "createdAt", "updatedAt")
      VALUES
        ('${legacy.tiedSecond}', 'workspace_test', '${legacy.tiedCampaign}', 'legacy_t2', 'Read the guide', '${SECOND}', '${T0}', '${T0}'),
        ('${legacy.threeThird}', 'workspace_test', '${legacy.threeCampaign}', 'legacy_h3', 'Third', '${THIRD}', '${T1}', '${T1}'),
        ('${legacy.distinctSecond}', 'workspace_test', '${legacy.distinctCampaign}', 'legacy_d2', 'Read the guide', '${SECOND}', '${T1}', '${T1}'),
        ('${legacy.tiedFirst}', 'workspace_test', '${legacy.tiedCampaign}', 'legacy_t1', 'Primary campaign link', '${PRIMARY}', '${T0}', '${T0}'),
        ('${legacy.threeSecond}', 'workspace_test', '${legacy.threeCampaign}', 'legacy_h2', 'Read the guide', '${SECOND}', '${T0}', '${T0}'),
        ('${legacy.singleOnly}', 'workspace_test', '${legacy.singleCampaign}', 'legacy_s1', 'Primary campaign link', '${PRIMARY}', '${T0}', '${T0}'),
        ('${legacy.distinctFirst}', 'workspace_test', '${legacy.distinctCampaign}', 'legacy_d1', 'Primary campaign link', '${PRIMARY}', '${T0}', '${T0}'),
        ('${legacy.threeFirst}', 'workspace_test', '${legacy.threeCampaign}', 'legacy_h1', 'Primary campaign link', '${PRIMARY}', '${T0}', '${T0}');
    `);

    await sql.query(migrationSql(POSITION_MIGRATION));
    for (const dir of dirs.filter((d) => d > POSITION_MIGRATION)) {
      await sql.query(migrationSql(dir));
    }

    // Sequential scans only, which is what Postgres picks for the small tables
    // of a typical self-hosted instance. A sequential scan returns rows in
    // their order on disk, the condition under which tied rows come back
    // swapped. Without this, whether the old bugs showed up here would depend
    // on the plan Postgres happened to choose.
    state.db = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: DATABASE_URL,
          options: "-c enable_indexscan=off -c enable_bitmapscan=off",
        },
        { schema }
      ),
    });
    state.workspaceId = "workspace_test";
    accountId = "account_test";
  }, 60_000);

  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  describe("the migration", () => {
    it("numbers existing links in the order they were created, ids breaking ties", async () => {
      const { rows } = await sql.query<{ id: string; position: number }>(
        `SELECT "id", "position" FROM "TrackedLink" WHERE "slug" LIKE 'legacy_%'`
      );
      const positions = Object.fromEntries(rows.map((r) => [r.id, r.position]));

      expect(positions).toEqual({
        [legacy.tiedFirst]: 0,
        [legacy.tiedSecond]: 1,
        [legacy.distinctFirst]: 0,
        [legacy.distinctSecond]: 1,
        [legacy.threeFirst]: 0,
        [legacy.threeSecond]: 1,
        [legacy.threeThird]: 2,
        [legacy.singleOnly]: 0,
      });
    });

    it("leaves updatedAt alone", async () => {
      const { rows } = await sql.query<{ changed: string }>(
        `SELECT count(*) AS changed FROM "TrackedLink"
         WHERE "slug" LIKE 'legacy_%' AND "updatedAt" <> "createdAt"`
      );
      expect(Number(rows[0].changed)).toBe(0);
    });

    it("changes nothing when run again, as a retry after a failed deploy does", async () => {
      const snapshot = `SELECT "id", "position", "updatedAt" FROM "TrackedLink" ORDER BY "id"`;
      const before = (await sql.query(snapshot)).rows;

      await sql.query(migrationSql(POSITION_MIGRATION));

      expect((await sql.query(snapshot)).rows).toEqual(before);
    });

    it("adds a column that defaults to 0 for writes that do not set it", async () => {
      const { rows } = await sql.query<{
        is_nullable: string;
        column_default: string;
        data_type: string;
      }>(
        `SELECT is_nullable, column_default, data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'TrackedLink' AND column_name = 'position'`,
        [schema]
      );
      expect(rows).toEqual([
        { is_nullable: "NO", column_default: "0", data_type: "integer" },
      ]);
    });
  });

  describe("reading", () => {
    it("keeps a duplicated campaign's buttons in order on the dashboard", async () => {
      // The reported bug: an original whose second link was added later, then
      // copied. Each copy's links are written together, and edits keep moving
      // rows on disk. Before this change most copies came back swapped here.
      const originalId = await createCampaign("Original", { primary: PRIMARY });
      await saveCampaign(originalId, { primary: PRIMARY, second: SECOND });

      const copyIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const copy = await duplicateCampaign({
          automationId: originalId,
          workspaceId: state.workspaceId,
        });
        copyIds.push(copy!.id);
        await moveOlderLinksOnDisk(originalId);
      }

      const res = await GET(jsonRequest("GET", "http://localhost/api/automations"));
      const campaigns: {
        id: string;
        trackedLinks: { label: string; destinationUrl: string }[];
      }[] = (await res.json()).data;

      for (const id of [originalId, ...copyIds]) {
        const campaign = campaigns.find((c) => c.id === id)!;
        expect(
          campaign.trackedLinks.map((l) => [l.destinationUrl, l.label])
        ).toEqual([
          [PRIMARY, "Primary campaign link"],
          [SECOND, "Read the guide"],
        ]);
      }
    });

    it("keeps order for links an older build writes while a deploy rolls out", async () => {
      // An older build does not know about position, so its two links land
      // with the default 0 and the same createdAt.
      const id = await createCampaign("Older build", {});
      await sql.query(
        `INSERT INTO "TrackedLink" ("id", "workspaceId", "automationId", "slug", "label", "destinationUrl", "createdAt", "updatedAt")
         VALUES
           ('cmolderbuild000000000000b2', 'workspace_test', $1, 'older_2', 'Read the guide', $3, '${T1}', '${T1}'),
           ('cmolderbuild000000000000a1', 'workspace_test', $1, 'older_1', 'Primary campaign link', $2, '${T1}', '${T1}')`,
        [id, PRIMARY, SECOND]
      );
      await moveOlderLinksOnDisk(id);

      expect(await storedLinks(id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 0 },
      ]);

      // The first save from the new build writes real positions.
      await saveCampaign(id, { primary: PRIMARY, second: SECOND });
      expect(await storedLinks(id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });
  });

  describe("writing", () => {
    it("creates a campaign's two links at positions 0 and 1", async () => {
      const id = await createCampaign("Created", { primary: PRIMARY, second: SECOND });

      expect(await storedLinks(id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });

    it("keeps both URLs when a campaign created with two links is saved unchanged", async () => {
      // Before this change the first save wrote the second URL over the first
      // link, every time, and the first URL was lost.
      const id = await createCampaign("Save me", { primary: PRIMARY, second: SECOND });

      // Whether the old code lost the link depended on how Postgres chose to
      // scan the table, so vary where the rows sit between saves.
      for (let i = 0; i < 3; i++) {
        await saveCampaign(id, { primary: PRIMARY, second: SECOND });
        await moveOlderLinksOnDisk(id);
      }

      expect(await storedLinks(id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });

    it("keeps both URLs when a migrated legacy campaign is saved", async () => {
      await saveCampaign(legacy.tiedCampaign, { primary: PRIMARY, second: SECOND });

      expect(await storedLinks(legacy.tiedCampaign)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });

    it("keeps a third link in place when the first two are saved", async () => {
      await saveCampaign(legacy.threeCampaign, {
        primary: PRIMARY,
        second: SECOND,
        secondLabel: "Renamed",
      });

      expect(await storedLinks(legacy.threeCampaign)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Renamed", destinationUrl: SECOND, position: 1 },
        { label: "Third", destinationUrl: THIRD, position: 2 },
      ]);
    });

    it("creates the second link once when two saves add it at the same time", async () => {
      const id = await createCampaign("Double click", { primary: PRIMARY });

      await Promise.all([
        saveCampaign(id, { primary: PRIMARY, second: SECOND }),
        saveCampaign(id, { primary: PRIMARY, second: SECOND }),
      ]);

      expect(await storedLinks(id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });

    it("gives a duplicate positions 0 and 1 in the original's order", async () => {
      const copy = await duplicateCampaign({
        automationId: legacy.distinctCampaign,
        workspaceId: state.workspaceId,
      });

      expect(await storedLinks(copy!.id)).toEqual([
        { label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 },
        { label: "Read the guide", destinationUrl: SECOND, position: 1 },
      ]);
    });
  });
});
