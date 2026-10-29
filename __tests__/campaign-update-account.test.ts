import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockSyncCampaignLinks } = vi.hoisted(() => {
  const mockPrisma = {
    automation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    instagramAccount: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrisma, mockSyncCampaignLinks: vi.fn() };
});

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentWorkspaceId: vi.fn(),
}));

vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: () => true,
  getCurrentWorkspaceContext: vi.fn(async () => ({
    workspaceId: "workspace_123",
    role: "OWNER",
  })),
}));

vi.mock("@/lib/campaigns/links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/campaigns/links")>()),
  syncCampaignLinks: mockSyncCampaignLinks,
}));

import { PATCH } from "../app/api/automations/route";

function patchRequest(body: unknown) {
  return new NextRequest("https://example.com/api/automations?id=automation_123", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.automation.findFirst.mockResolvedValue({
    id: "automation_123",
    workspaceId: "workspace_123",
    instagramAccountId: "account_old",
  });
  mockPrisma.automation.update.mockImplementation(async ({ data }) => ({
    id: "automation_123",
    ...data,
  }));
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
});

describe("PATCH /api/automations", () => {
  it("moves the campaign to another account in the same workspace", async () => {
    mockPrisma.instagramAccount.findFirst.mockResolvedValue({ id: "account_new" });

    const response = await PATCH(patchRequest({ instagramAccountId: "account_new" }));

    expect(response.status).toBe(200);
    expect(mockPrisma.instagramAccount.findFirst).toHaveBeenCalledWith({
      where: { id: "account_new", workspaceId: "workspace_123" },
      select: { id: true },
    });
    expect(mockPrisma.automation.update).toHaveBeenCalledWith({
      where: { id: "automation_123" },
      data: expect.objectContaining({ instagramAccountId: "account_new" }),
    });
  });

  it("rejects an account that belongs to another workspace", async () => {
    mockPrisma.instagramAccount.findFirst.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ instagramAccountId: "account_foreign" }));

    expect(response.status).toBe(404);
    expect(mockPrisma.automation.update).not.toHaveBeenCalled();
  });

  it("skips the account lookup when the account is unchanged", async () => {
    const response = await PATCH(patchRequest({ instagramAccountId: "account_old" }));

    expect(response.status).toBe(200);
    expect(mockPrisma.instagramAccount.findFirst).not.toHaveBeenCalled();
  });
});
