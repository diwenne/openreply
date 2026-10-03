import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), $executeRaw: vi.fn(), automation: {
    findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
  } }, media: vi.fn(), revision: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/campaigns/mutations", () => ({ saveCampaignRevision: mocks.revision }));
vi.mock("@/lib/instagram/provider", () => ({ createInstagramContext: async () => ({}), hasInstagramCredentials: () => true, getUserMedia: mocks.media }));
import { attachPendingNextReels } from "@/lib/automation/attach-next-reel";
const campaign = {
  id: "campaign", instagramAccountId: "account", pendingNextReel: true,
  isActive: true, lifecycle: "ACTIVE", version: 1,
  createdAt: new Date("2026-10-01"), armedAt: new Date("2026-10-03T08:00:00Z"),
  instagramAccount: { id: "account" },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma));
  mocks.prisma.automation.findMany.mockResolvedValue([campaign]);
  mocks.prisma.automation.findFirst.mockResolvedValueOnce(campaign).mockResolvedValue(null);
  mocks.prisma.automation.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.automation.findUnique.mockResolvedValue({ ...campaign, version: 2 });
  mocks.media.mockResolvedValue([
    { id: "old", media_product_type: "REELS", timestamp: "2026-10-02T08:00:00Z" },
    { id: "new", media_product_type: "REELS", timestamp: "2026-10-03T09:00:00Z", permalink: "https://instagram.com/reel/new" },
  ]);
});
describe("atomic active next-reel attachment", () => {
  it("uses armedAt and saves a versioned system revision", async () => {
    expect(await attachPendingNextReels()).toMatchObject({ bound: 1 });
    expect(mocks.prisma.automation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pendingNextReel: true, isActive: true, lifecycle: "ACTIVE" } }));
    expect(mocks.prisma.automation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ postId: "new", version: { increment: 1 } }) }));
    expect(mocks.revision).toHaveBeenCalledWith(mocks.prisma, expect.objectContaining({ version: 2 }), "system:next-reel");
  });
  it("refuses to bind multiple legacy waiting campaigns to the same reel", async () => {
    mocks.prisma.automation.findMany.mockResolvedValue([campaign, { ...campaign, id: "other" }]);
    expect(await attachPendingNextReels()).toMatchObject({ bound: 0 });
    expect(mocks.media).not.toHaveBeenCalled();
  });
  it("rechecks pause or version edits after the external media fetch", async () => {
    mocks.prisma.automation.findFirst.mockReset().mockResolvedValue(null);
    expect(await attachPendingNextReels()).toMatchObject({ bound: 0 });
    expect(mocks.prisma.automation.updateMany).not.toHaveBeenCalled();
  });
  it("does not silently choose another reel if the intended one was already assigned", async () => {
    mocks.prisma.automation.findFirst.mockReset().mockResolvedValueOnce(campaign).mockResolvedValueOnce({ id: "occupied" });
    expect(await attachPendingNextReels()).toMatchObject({ bound: 0 });
    expect(mocks.prisma.automation.updateMany).not.toHaveBeenCalled();
  });
  it("concurrent attachment cannot count an already-bound row as a second success", async () => {
    mocks.prisma.automation.updateMany.mockResolvedValue({ count: 0 });
    expect(await attachPendingNextReels()).toMatchObject({ bound: 0 });
    expect(mocks.revision).not.toHaveBeenCalled();
  });
  it("keeps a failed Meta fetch unbound and observable", async () => {
    mocks.media.mockRejectedValue(new Error("Meta unavailable"));
    expect(await attachPendingNextReels()).toMatchObject({ bound: 0, failedAccounts: 1 });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
