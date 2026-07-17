import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    automation: {
      findFirst: vi.fn(),
    },
    dmLog: {
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    linkClick: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

import { getCampaignReportBySlug } from "../lib/reports/data";
import { buildReportUrl, isReportBranded } from "../lib/reports/share";

const baseAutomation = {
  id: "automation_123",
  workspaceId: "workspace_123",
  name: "Product Link Drop",
  goal: "Product link request",
  postUrl: "https://instagram.com/p/example",
  keywords: ["LINK", "SHOP"],
  isActive: true,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-20T00:00:00.000Z"),
  reportShareSlug: "report_123",
  workspace: {
    name: "Acme Studio",
  },
  instagramAccount: {
    username: "acme",
  },
  trackedLinks: [
    {
      id: "link_123",
      slug: "tracked_123",
      destinationUrl: "https://www.example.com/product",
      _count: { clicks: 12 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.automation.findFirst.mockResolvedValue(baseAutomation);
  mockPrisma.dmLog.groupBy
    .mockResolvedValueOnce([
      { status: "SENT", _count: { _all: 20 } },
      { status: "FAILED", _count: { _all: 1 } },
      { status: "SKIPPED_RATE_LIMIT", _count: { _all: 2 } },
    ])
    .mockResolvedValueOnce([
      { matchedKeyword: "LINK", _count: { _all: 14 } },
      { matchedKeyword: "SHOP", _count: { _all: 6 } },
    ]);
  mockPrisma.linkClick.count.mockResolvedValue(12);
  mockPrisma.dmLog.findFirst.mockResolvedValue({
    dmSentAt: new Date("2026-05-20T12:00:00.000Z"),
    createdAt: new Date("2026-05-20T12:00:00.000Z"),
  });
  mockPrisma.dmLog.count.mockResolvedValue(2);
});

describe("campaign reports", () => {
  it("builds an unbranded report without private log data", async () => {
    const report = await getCampaignReportBySlug("report_123");

    expect(report).toMatchObject({
      shareSlug: "report_123",
      branded: false,
      workspace: { name: "Acme Studio" },
      campaign: {
        name: "Product Link Drop",
        instagramUsername: "acme",
      },
      metrics: {
        sent: 20,
        skipped: 2,
        failed: 1,
        clicks: 12,
        ctr: 60,
      },
      topKeywords: [
        { keyword: "LINK", count: 14 },
        { keyword: "SHOP", count: 6 },
      ],
      trackedLinks: [
        {
          destinationHost: "example.com",
          clicks: 12,
        },
      ],
    });
    expect(report?.daily).toHaveLength(7);
    expect("dmMessage" in (report?.campaign ?? {})).toBe(false);
  });

  it("returns null when a report slug is missing or disabled", async () => {
    mockPrisma.automation.findFirst.mockResolvedValueOnce(null);

    await expect(getCampaignReportBySlug("missing")).resolves.toBeNull();
  });

  it("builds report URLs and branding flags", () => {
    expect(buildReportUrl("abc123", "https://manychat-alternative.com/")).toBe(
      "https://manychat-alternative.com/reports/abc123"
    );
    expect(isReportBranded()).toBe(false);
  });
});
