import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    automation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

import { buildDuplicateName, duplicateCampaign } from "../lib/campaigns/duplicate";

// A campaign with every option turned on, shaped like the stored row.
const sourceCampaign = {
  id: "automation_123",
  workspaceId: "workspace_123",
  instagramAccountId: "account_123",
  name: "Product Link Drop",
  goal: "Product link request",
  postId: "post_123",
  postUrl: "https://instagram.com/p/example",
  pendingNextReel: false,
  matchAnyPost: false,
  keywords: ["LINK", "SHOP"],
  matchAnyWord: false,
  dmTriggerEnabled: true,
  dmMessage: "Here is the link {username}",
  openingDmEnabled: true,
  openingDmMessage: "Tap below for the link",
  openingDmButtonLabel: "Send it",
  linkButtonLabel: "Get offer",
  requireFollow: true,
  followPromptMessage: "Follow first, then tap below",
  followPromptButtonLabel: "i'm following",
  followUpEnabled: true,
  followUpMessage: "Thanks for grabbing it!",
  followUpDelayMinutes: 30,
  publicReplyEnabled: true,
  publicReplyMessage: "Sent!",
  publicReplyMessages: ["Sent!", "Check your DMs"],
  isActive: true,
  wholeWordMatch: true,
  reportShareSlug: "report_123",
  reportShareEnabled: false,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
  trackedLinks: [
    {
      id: "link_1",
      slug: "tracked_1",
      label: "Primary campaign link",
      destinationUrl: "https://example.com/product",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    },
    {
      id: "link_2",
      slug: "tracked_2",
      label: "Read the guide",
      destinationUrl: "https://example.com/guide",
      createdAt: new Date("2026-05-02T00:00:00.000Z"),
    },
  ],
};

// Fields of the original that describe which row it is, not how it behaves.
// Everything else has to reach the copy.
const NOT_COPIED = new Set([
  "id",
  "name",
  "isActive",
  "reportShareSlug",
  "createdAt",
  "updatedAt",
  "trackedLinks",
]);

function createArgs() {
  return mockPrisma.automation.create.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.automation.findFirst.mockResolvedValue(sourceCampaign);
  mockPrisma.automation.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "automation_copy",
      ...data,
    })
  );
});

describe("duplicateCampaign", () => {
  it("copies the settings the old client-side payload dropped", async () => {
    await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_123",
    });

    expect(createArgs().data).toMatchObject({
      // "Also reply when someone DMs these words".
      dmTriggerEnabled: true,
      // The follow-up thank-you message.
      followUpEnabled: true,
      followUpMessage: "Thanks for grabbing it!",
      followUpDelayMinutes: 30,
      // The primary link button title.
      linkButtonLabel: "Get offer",
      goal: "Product link request",
      reportShareEnabled: false,
    });
  });

  it("copies every setting on the source row", async () => {
    await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_123",
    });

    const { data } = createArgs();
    for (const [field, value] of Object.entries(sourceCampaign)) {
      if (NOT_COPIED.has(field)) continue;
      expect({ [field]: data[field] }).toEqual({ [field]: value });
    }
  });

  it("starts the copy paused and renames it", async () => {
    const copy = await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_123",
    });

    expect(copy).toMatchObject({
      isActive: false,
      name: "Product Link Drop copy",
    });
    // The copy is a new row, so the id and timestamps are left to the database.
    expect(createArgs().data.id).toBeUndefined();
    expect(createArgs().data.createdAt).toBeUndefined();
  });

  it("keeps the copied name within the 100 character limit", () => {
    const longName = "a".repeat(100);
    const duplicated = buildDuplicateName(longName);

    expect(duplicated.length).toBeLessThanOrEqual(100);
    expect(duplicated.endsWith(" copy")).toBe(true);
  });

  it("gives the copy its own report link", async () => {
    await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_123",
    });

    expect(createArgs().data.reportShareSlug).toEqual(expect.any(String));
    expect(createArgs().data.reportShareSlug).not.toBe(
      sourceCampaign.reportShareSlug
    );
  });

  it("recreates every tracked link with a fresh slug and its own label", async () => {
    await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_123",
    });

    const created = createArgs().data.trackedLinks.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      workspaceId: "workspace_123",
      label: "Primary campaign link",
      destinationUrl: "https://example.com/product",
    });
    expect(created[1]).toMatchObject({
      label: "Read the guide",
      destinationUrl: "https://example.com/guide",
    });

    const slugs = created.map((link: { slug: string }) => link.slug);
    expect(slugs).not.toContain("tracked_1");
    expect(slugs).not.toContain("tracked_2");
    expect(new Set(slugs).size).toBe(2);
  });

  it("does not copy a campaign from another workspace", async () => {
    mockPrisma.automation.findFirst.mockResolvedValue(null);

    const copy = await duplicateCampaign({
      automationId: "automation_123",
      workspaceId: "workspace_other",
    });

    expect(copy).toBeNull();
    expect(mockPrisma.automation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "automation_123", workspaceId: "workspace_other" },
      })
    );
    expect(mockPrisma.automation.create).not.toHaveBeenCalled();
  });
});
