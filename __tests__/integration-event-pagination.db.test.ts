import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Independent review probe: real SQL ordering/limits, mock only authentication.
const state = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/integrations/auth", () => ({
  authenticateService: async () => ({ workspaceId: "workspace_review", keyId: "review", scopes: ["events:read"] }),
  requireScope: () => undefined,
}));
import { GET } from "../app/api/v1/events/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `event_review_${randomBytes(5).toString("hex")}`;
let sql: Client;
const timestamp = new Date(Date.now() - 120_000).toISOString();

describe.skipIf(!databaseUrl)("integration event pagination (real Postgres)", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const migrations = path.join(__dirname, "..", "prisma", "migrations");
    for (const name of readdirSync(migrations, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
      await sql.query(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    }
    await sql.query(`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('review_user', 'pagination@review.invalid', now());
      INSERT INTO "Workspace" ("id", "name", "ownerId", "updatedAt") VALUES
        ('workspace_review', 'Review', 'review_user', now()), ('workspace_other', 'Other', 'review_user', now());
      INSERT INTO "InstagramAccount" ("id", "workspaceId", "instagramId", "username", "accessToken", "updatedAt")
        VALUES ('review_account', 'workspace_review', 'review_instagram', 'review', 'unused', now());
      INSERT INTO "Automation" ("id", "workspaceId", "instagramAccountId", "name", "keywords", "dmMessage", "updatedAt")
        VALUES ('review_campaign', 'workspace_review', 'review_account', 'Review', '{LINK}', 'unused', now());`);
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
  }, 60_000);
  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) { await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await sql.end(); }
  });

  async function replaceEvents(deliveries: number, integrations: number) {
    await state.db.deliveryEvent.deleteMany();
    await state.db.integrationEvent.deleteMany();
    await state.db.deliveryEvent.createMany({ data: Array.from({ length: deliveries }, (_, i) => ({
      id: `delivery${String(i).padStart(4, "0")}`, workspaceId: "workspace_review", automationId: "review_campaign",
      operationKey: `review_operation_${i}`, stage: "REVEAL", status: "SENT", updatedAt: new Date(timestamp),
    })) });
    await state.db.integrationEvent.createMany({ data: Array.from({ length: integrations }, (_, i) => ({
      id: `integration${String(i).padStart(4, "0")}`, workspaceId: "workspace_review", eventType: "conversion.form_completed",
      payload: { index: i }, createdAt: new Date(timestamp),
    })) });
    await state.db.integrationEvent.create({ data: { id: "other_workspace_event", workspaceId: "workspace_other",
      eventType: "other", payload: {}, createdAt: new Date(timestamp) } });
  }

  async function readAll() {
    let cursor: string | null = null;
    const seen: string[] = [];
    let pages = 0;
    do {
      const url = new URL("http://localhost/api/v1/events");
      if (cursor) url.searchParams.set("cursor", cursor);
      else url.searchParams.set("since", new Date(Date.parse(timestamp) - 1000).toISOString());
      const response = await GET(new Request(url));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.events.length).toBeLessThanOrEqual(200);
      seen.push(...body.events.map((event: { eventId: string }) => event.eventId));
      cursor = body.nextCursor;
      expect(++pages).toBeLessThan(10);
    } while (cursor);
    return { seen, pages };
  }

  it.each([[240, 240], [20, 460], [460, 20], [0, 480], [480, 0]])(
    "does not lose tied-time rows crossing d/i source boundary (%i + %i)", async (deliveries, integrations) => {
      await replaceEvents(deliveries, integrations);
      const { seen, pages } = await readAll();
      const expected = [
        ...Array.from({ length: deliveries }, (_, i) => `d:delivery${String(i).padStart(4, "0")}`),
        ...Array.from({ length: integrations }, (_, i) => `i:integration${String(i).padStart(4, "0")}`),
      ];
      expect(seen).toEqual(expected);
      expect(new Set(seen).size).toBe(deliveries + integrations);
      expect(pages).toBe(3);
    }, 30_000,
  );
});
