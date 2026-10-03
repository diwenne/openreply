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
import { selectTriggerWinner } from "../lib/queue/trigger-selection";
import { scheduleFollowUp } from "../lib/queue/follow-up-delivery";

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
  it("atomically creates one stage event with the persistent send claim", async () => {
    await seed("stage-claim");
    const delivery = { workspaceId: "workspace", instagramAccountId: "account", version: 3,
      stage: "REVEAL", recipientId: "user_ig", message: "Frozen message" };
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      claimCommentDelivery("automation", "stage-claim", "dm", delivery)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const events = await state.db.deliveryEvent.findMany({ where: { stage: "REVEAL" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "CLAIMED", attempts: 1, campaignVersion: 3, message: "Frozen message" });
    expect(await claimCommentDelivery("automation", "stage-claim", "dm", delivery)).toBe(false);
  });
  it("a paused campaign cannot claim a new durable stage", async () => {
    await seed("paused-stage");
    await state.db.automation.update({ where: { id: "automation" }, data: { isActive: false, lifecycle: "PAUSED" } });
    try {
      expect(await claimCommentDelivery("automation", "paused-stage", "dm", {
        workspaceId: "workspace", instagramAccountId: "account", version: 1,
        stage: "OPENING_DM", recipientId: "user_ig", message: "Never send" })).toBe(false);
      expect(await state.db.deliveryEvent.count({ where: { stage: "OPENING_DM" } })).toBe(0);
    } finally {
      await state.db.automation.update({ where: { id: "automation" }, data: { isActive: true, lifecycle: "ACTIVE" } });
    }
  });
  it("freezes a trigger winner and content across concurrent jobs and edits without falling through", async () => {
    await state.db.automation.update({ where: { id: "automation" },
      data: { matchAnyPost: true, dmMessage: "Original delivery", priority: 10 } });
    await state.db.automation.create({ data: { id: "lower-priority", workspaceId: "workspace",
      instagramAccountId: "account", name: "Lower priority", keywords: ["AI"],
      dmMessage: "Never fall through", matchAnyPost: true, priority: 0 } });
    const candidates = () => state.db.automation.findMany({
      where: { id: { in: ["automation", "lower-priority"] } }, include: { instagramAccount: true, trackedLinks: true } });
    const input = { kind: "comment" as const, text: "AI", inputId: "frozen-trigger", instagramId: "test_ig" };
    try {
      const campaigns = await candidates();
      const winners = await Promise.all(Array.from({ length: 8 }, () => selectTriggerWinner(campaigns, input)));
      expect(winners.every((winner) => winner?.id === "automation")).toBe(true);
      const reservation = await state.db.deliveryEvent.findFirstOrThrow({ where: { stage: "TRIGGER" } });
      expect(await state.db.deliveryEvent.count({ where: { stage: "TRIGGER" } })).toBe(1);
      expect(JSON.stringify(reservation.payload)).not.toContain("local-test-only");
      await state.db.automation.update({ where: { id: "automation" }, data: { dmMessage: "Edited delivery", version: 2 } });
      expect(await selectTriggerWinner(await candidates(), input)).toMatchObject({ id: "automation", version: 1, dmMessage: "Original delivery" });
      await state.db.automation.update({ where: { id: "automation" }, data: { isActive: false, lifecycle: "PAUSED" } });
      expect(await selectTriggerWinner(await candidates(), input)).toBeNull();
    } finally {
      await state.db.automation.update({ where: { id: "automation" }, data: { isActive: true, lifecycle: "ACTIVE" } });
    }
  });
  it("persists one immutable follow-up across parallel result transactions", async () => {
    const campaign = await state.db.automation.update({ where: { id: "automation" },
      data: { followUpEnabled: true, followUpMessage: "Thanks {username}", followUpDelayMinutes: 5 },
      include: { instagramAccount: true } });
    const interactionAt = new Date();
    await Promise.all(Array.from({ length: 8 }, () => state.db.$transaction((tx) =>
      scheduleFollowUp(campaign, { userId: "user_ig", commenterName: "Example", sourceId: "parallel-tap", interactionAt }, tx))));
    expect(await state.db.deliveryEvent.count({ where: { stage: "FOLLOW_UP" } })).toBe(1);
    const event = await state.db.deliveryEvent.findFirstOrThrow({ where: { stage: "FOLLOW_UP" } });
    expect(event).toMatchObject({ status: "PENDING", message: "Thanks Example", recipientId: "user_ig" });
    await state.db.$transaction((tx) => scheduleFollowUp({ ...campaign, followUpMessage: "Edited text" },
      { userId: "user_ig", commenterName: "Example", sourceId: "parallel-tap", interactionAt }, tx));
    expect((await state.db.deliveryEvent.findUniqueOrThrow({ where: { id: event.id } })).message).toBe("Thanks Example");
  });
  it("parallel inbound-DM log creation still permits only one pre-send claim", async () => {
    const results = await Promise.all(Array.from({ length: 16 }, async () => {
      await state.db.dmLog.upsert({
        where: { automationId_commentId: { automationId: "automation", commentId: "dm:parallel-message" } },
        create: { workspaceId: "workspace", instagramAccountId: "account", automationId: "automation",
          commenterId: "user_ig", commentId: "dm:parallel-message", commentText: "AI", status: "PENDING" },
        update: { commentId: "dm:parallel-message" },
      });
      return claimCommentDelivery("automation", "dm:parallel-message", "dm", {
        workspaceId: "workspace", instagramAccountId: "account", version: 2,
        stage: "REVEAL", recipientId: "user_ig", message: "Frozen message" });
    }));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await state.db.dmLog.count({ where: { commentId: "dm:parallel-message" } })).toBe(1);
    expect((await state.db.dmLog.findFirstOrThrow({ where: { commentId: "dm:parallel-message" } })).attempts).toBe(1);
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
