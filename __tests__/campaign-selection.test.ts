import { describe, expect, it, vi } from "vitest";
import { campaignActivationErrors, campaignCanSend, selectAutomation, type CampaignRule } from "@/lib/campaigns/selection";
import { assertNextReelAvailable, resolveLifecycle } from "@/lib/campaigns/mutations";
import type { Prisma } from "@/app/generated/prisma/client";

function campaign(overrides: Partial<CampaignRule> = {}): CampaignRule {
  return { id: "campaign", lifecycle: "ACTIVE", isActive: true, createdAt: new Date("2026-01-01"), keywords: ["link"], matchAnyWord: false, wholeWordMatch: true, matchAnyPost: true, dmTriggerEnabled: true, ...overrides };
}
const comment = { kind: "comment" as const, text: "LINK please", mediaIds: ["post"] };
describe("deterministic campaign selection", () => {
  it("prefers a specific post over an older global even with higher priority", () => {
    const global = campaign({ id: "global", priority: 100 });
    const specific = campaign({ id: "specific", matchAnyPost: false, postId: "post", priority: -100 });
    expect(selectAutomation([global, specific], comment).winner?.id).toBe("specific");
  });
  it("uses priority then created/id; surfaces semantic ties independent of order", () => {
    const a = campaign({ id: "a", priority: 10 });
    const b = campaign({ id: "b", priority: 10 });
    const c = campaign({ id: "c", priority: 9 });
    expect(selectAutomation([c, b, a], comment).winner?.id).toBe("a");
    expect(selectAutomation([a, b, c], comment).conflicts.map((c) => c.id)).toEqual(["b"]);
  });
  it("never sends drafts, archives, paused or pending next reels", () => {
    for (const lifecycle of ["DRAFT", "ARCHIVED", "PAUSED"]) expect(campaignCanSend(campaign({ lifecycle }))).toBe(false);
    expect(selectAutomation([campaign({ pendingNextReel: true })], comment).winner).toBeNull();
    expect(selectAutomation([campaign({ isActive: false })], comment).winner).toBeNull();
  });
  it("does not match a specific campaign to a different post", () => {
    expect(selectAutomation([campaign({ matchAnyPost: false, postId: "other" })], comment).winner).toBeNull();
  });
  it("uses provider-normalized whole word rules for exclusions", () => {
    expect(selectAutomation([campaign({ excludedKeywords: ["nein"] })], { ...comment, text: "LINK aber nein" }).winner).toBeNull();
    expect(selectAutomation([campaign({ excludedKeywords: ["no"] })], { ...comment, text: "link november" }).winner).not.toBeNull();
    expect(selectAutomation([campaign({ excludedKeywords: ["no"], wholeWordMatch: false })], { ...comment, text: "link november" }).winner).toBeNull();
  });
  it("has separate DM ranking without post specificity; matches only DM-enabled campaigns", () => {
    const specific = campaign({ id: "specific", matchAnyPost: false, postId: "post", priority: 0 });
    const global = campaign({ id: "global", priority: 1 });
    expect(selectAutomation([specific, global], { kind: "dm", text: "link" }).winner?.id).toBe("global");
    expect(selectAutomation([campaign({ dmTriggerEnabled: false })], { kind: "dm", text: "link" }).winner).toBeNull();
  });
  it("retains matched keywords and ignores empty any-word input", () => {
    expect(selectAutomation([campaign()], comment).matchedKeyword).toBe("link");
    expect(selectAutomation([campaign({ matchAnyWord: true })], { ...comment, text: "  " }).winner).toBeNull();
  });
  it("supports legacy rows without lifecycle", () => {
    expect(campaignCanSend(campaign({ lifecycle: undefined }))).toBe(true);
    expect(resolveLifecycle({}, { lifecycle: "PAUSED", isActive: false })).toBe("PAUSED");
    expect(resolveLifecycle({ isActive: false }, { lifecycle: "ACTIVE", isActive: true })).toBe("PAUSED");
    expect(resolveLifecycle({ lifecycle: "ARCHIVED", isActive: true })).toBe("ARCHIVED");
  });
});
describe("activation safety", () => {
  it("rejects incomplete content and accepts complete final content", () => {
    expect(campaignActivationErrors({ keywords: [], matchAnyWord: false, dmMessage: "" })).toHaveLength(3);
    expect(campaignActivationErrors({ postId: "post", keywords: ["link"], matchAnyWord: false, dmMessage: "resource" })).toEqual([]);
    expect(campaignActivationErrors({ matchAnyPost: true, pendingNextReel: true, keywords: ["link"], matchAnyWord: false, dmMessage: "resource" })).toContain("Choose exactly one post scope.");
  });
  it("locks the account before checking another armed campaign", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue({ name: "Other reel" });
    const tx = { $executeRaw: execute, automation: { findFirst } } as unknown as Prisma.TransactionClient;
    await expect(assertNextReelAvailable(tx, "account", true, "campaign")).rejects.toThrow("Other reel");
    expect(execute.mock.calls[0][1]).toBe("next-reel:account");
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[0]);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ lifecycle: "ACTIVE", isActive: true, pendingNextReel: true, id: { not: "campaign" } });
  });
  it("always locks but does not reject saving an unarmed draft", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn();
    await assertNextReelAvailable({ $executeRaw: execute, automation: { findFirst } } as unknown as Prisma.TransactionClient, "account", false);
    expect(execute).toHaveBeenCalledOnce();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
