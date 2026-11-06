import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
}));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return state.db;
  },
}));
import { claimCommentDelivery } from "../lib/queue/comment-delivery";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `delivery_claims_${randomBytes(4).toString("hex")}`;
let sql: Client;

describe.skipIf(!databaseUrl)("durable comment delivery on Postgres", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    for (const entry of readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await sql.query(
        readFileSync(path.join(root, entry.name, "migration.sql"), "utf8"),
      );
    }
    state.db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }),
    });
    await state.db.user.create({
      data: { id: "user", email: "delivery@example.test" },
    });
    await state.db.workspace.create({
      data: { id: "workspace", name: "Delivery", ownerId: "user" },
    });
    await state.db.instagramAccount.create({
      data: {
        id: "account",
        workspaceId: "workspace",
        instagramId: "test_ig",
        username: "delivery",
        accessToken: "local-test-only",
      },
    });
    await state.db.automation.create({
      data: {
        id: "automation",
        workspaceId: "workspace",
        instagramAccountId: "account",
        name: "Test",
        keywords: ["AI"],
        dmMessage: "Test",
      },
    });
  }, 60_000);
  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });
  async function seed(commentId: string) {
    return state.db.dmLog.create({
      data: {
        workspaceId: "workspace",
        instagramAccountId: "account",
        automationId: "automation",
        commenterId: "user_ig",
        commentId,
        commentText: "AI",
      },
    });
  }
  it("allows exactly one concurrent send and survives a lost result write", async () => {
    await seed("concurrent");
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimCommentDelivery("automation", "concurrent", "dm"),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    // A restarted worker or a fresh polling job still observes the persisted claim.
    expect(await claimCommentDelivery("automation", "concurrent", "dm")).toBe(
      false,
    );
    const row = await state.db.dmLog.findUniqueOrThrow({
      where: {
        automationId_commentId: {
          automationId: "automation",
          commentId: "concurrent",
        },
      },
    });
    expect(row).toMatchObject({ attempts: 1, dmDeliveryUnconfirmed: true });
    await seed("another-comment");
    expect(
      await claimCommentDelivery("automation", "another-comment", "dm"),
    ).toBe(true);
  });
  it("caps actual attempts across independent jobs after confirmed rejections", async () => {
    const row = await seed("bounded");
    for (let i = 0; i < 3; i++) {
      expect(await claimCommentDelivery("automation", "bounded", "dm")).toBe(
        true,
      );
      await state.db.dmLog.update({
        where: { id: row.id },
        data: { dmDeliveryUnconfirmed: false, status: "FAILED" },
      });
    }
    expect(await claimCommentDelivery("automation", "bounded", "dm")).toBe(
      false,
    );
    expect(
      (await state.db.dmLog.findUniqueOrThrow({ where: { id: row.id } }))
        .attempts,
    ).toBe(3);
  });
  it("claims public replies independently and never repeats a confirmed send", async () => {
    const row = await seed("public");
    expect(await claimCommentDelivery("automation", "public", "public")).toBe(
      true,
    );
    expect(await claimCommentDelivery("automation", "public", "public")).toBe(
      false,
    );
    expect(await claimCommentDelivery("automation", "public", "dm")).toBe(true);
    await state.db.dmLog.update({
      where: { id: row.id },
      data: {
        publicReplyDeliveryUnconfirmed: false,
        publicReplySentAt: new Date(),
        dmDeliveryUnconfirmed: false,
        status: "SENT",
      },
    });
    expect(await claimCommentDelivery("automation", "public", "public")).toBe(
      false,
    );
    expect(await claimCommentDelivery("automation", "public", "dm")).toBe(
      false,
    );
  });
});
