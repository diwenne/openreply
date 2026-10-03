import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prisma: { automation: { findFirst: vi.fn() }, deliveryEvent: {
    upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  } }, send: vi.fn(), queue: vi.fn(), context: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/instagram/provider", () => ({
  createInstagramContext: mocks.context, hasInstagramCredentials: () => true, sendDirectMessage: mocks.send,
}));
vi.mock("@/lib/queue/client", () => ({ FOLLOWUP_JOB_NAME: "process-followup", getDMQueue: () => ({ add: mocks.queue }) }));
import { scheduleFollowUp, deliverFollowUp, recoverPendingFollowUps } from "@/lib/queue/follow-up-delivery";
import { MetaApiError } from "@/lib/meta/client";

const now = new Date("2026-10-03T09:00:00Z");
const campaign = {
  id: "campaign", workspaceId: "workspace", instagramAccountId: "connection", version: 4,
  isActive: true, lifecycle: "ACTIVE", followUpEnabled: true,
  followUpMessage: "Thanks {username}!", followUpDelayMinutes: 5,
  instagramAccount: { instagramId: "instagram", accessToken: "secret" },
};
const data = { automationId: "campaign", instagramAccountId: "instagram", accountConnectionId: "connection", userId: "recipient", deliveryEventId: "event" };
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.resetAllMocks();
  stored = {};
  mocks.prisma.automation.findFirst.mockResolvedValue(campaign);
  mocks.context.mockResolvedValue({ provider: "META" });
  mocks.prisma.deliveryEvent.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
    if (!stored.id) stored = { id: "event", ...create }; return stored;
  });
  mocks.prisma.deliveryEvent.findUnique.mockImplementation(async () => stored);
  mocks.prisma.deliveryEvent.updateMany.mockImplementation(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
    if (stored.status !== where.status) return { count: 0 };
    stored = { ...stored, ...data }; return { count: 1 };
  });
  mocks.prisma.deliveryEvent.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { stored = { ...stored, ...data }; return stored; });
});
afterEach(() => vi.useRealTimers());
async function prepare() {
  await scheduleFollowUp(campaign, { userId: "recipient", commenterName: "Maya", sourceId: "tap", interactionAt: now });
  vi.setSystemTime(new Date(now.getTime() + 5 * 60_000));
}
describe("durable immutable follow-up delivery", () => {
  it("snapshots rendered text and version and ignores subsequent text edits", async () => {
    await prepare();
    mocks.prisma.automation.findFirst.mockResolvedValue({ ...campaign, followUpMessage: "Changed", version: 5 });
    await deliverFollowUp(data, "job");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ message: "Thanks Maya!" }));
    expect(stored).toMatchObject({ status: "SENT", campaignVersion: 4 });
    expect(JSON.stringify(stored)).not.toContain("secret");
  });
  it("only one parallel worker can claim the same scheduled message", async () => {
    await prepare();
    await Promise.all([deliverFollowUp(data, "one"), deliverFollowUp(data, "two")]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("marks a network response ambiguous and never resends it", async () => {
    await prepare(); mocks.send.mockRejectedValue(new Error("Lost response"));
    await deliverFollowUp(data, "job"); await deliverFollowUp(data, "retry");
    expect(stored).toMatchObject({ status: "UNCONFIRMED" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("records an explicit Meta rejection as FAILED", async () => {
    await prepare(); mocks.send.mockRejectedValue(new MetaApiError(10, undefined, undefined, "Outside window"));
    await deliverFollowUp(data, "job");
    expect(stored.status).toBe("FAILED");
  });
  it("paused and archived campaigns stop queued follow-ups", async () => {
    await prepare(); mocks.prisma.automation.findFirst.mockResolvedValue({ ...campaign, lifecycle: "ARCHIVED", isActive: false });
    await deliverFollowUp(data, "job");
    expect(stored.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send beyond the real interaction window even with a previously queued event", async () => {
    await prepare(); vi.setSystemTime(new Date(now.getTime() + 24 * 60 * 60_000));
    await deliverFollowUp(data, "job");
    expect(stored.status).toBe("SKIPPED"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("missing and future interaction anchors cannot create a sendable reminder", async () => {
    await scheduleFollowUp(campaign, { userId: "recipient", commenterName: null, sourceId: "old", interactionAt: null });
    expect(stored.status).toBe("SKIPPED"); expect(mocks.queue).not.toHaveBeenCalled();
    stored = {};
    await scheduleFollowUp(campaign, { userId: "recipient", commenterName: null, sourceId: "future", interactionAt: new Date(now.getTime() + 60_000) });
    expect(stored.status).toBe("SKIPPED");
  });
  it("legacy queue jobs are explicitly recorded as skipped", async () => {
    await deliverFollowUp({ ...data, deliveryEventId: undefined }, "legacy");
    expect(stored).toMatchObject({ status: "SKIPPED", operationKey: "legacy_followup_legacy" });
  });
  it("an interrupted claimed send is never automatically resumed", async () => {
    await prepare(); stored.status = "CLAIMED";
    await deliverFollowUp(data, "retry"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("recovers durable pending events after Redis insertion failed, without long-delay starvation", async () => {
    mocks.queue.mockRejectedValueOnce(new Error("Redis down"));
    await prepare(); expect(stored.status).toBe("PENDING");
    mocks.prisma.deliveryEvent.findMany.mockResolvedValue([stored]);
    await recoverPendingFollowUps();
    expect(mocks.queue).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.deliveryEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ scheduledAt: { lte: expect.any(Date) } }) }));
  });
  it("fails closed before external send when storing the claim fails", async () => {
    await prepare(); mocks.prisma.deliveryEvent.updateMany.mockRejectedValue(new Error("DB down"));
    await expect(deliverFollowUp(data, "job")).rejects.toThrow("DB down");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects a job whose connection differs from the frozen account", async () => {
    await prepare();
    await deliverFollowUp({ ...data, accountConnectionId: "other-connection" }, "job");
    expect(stored.status).toBe("SKIPPED");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
