import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    instagramAccount: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

import {
  canConnectInstagramAccount,
  getInstagramAccountLimit,
  getWorkspaceInstagramAccount,
} from "../lib/instagram-accounts";
import {
  buildInvitationUrl,
  normalizeInvitationEmail,
} from "../lib/workspace-invitations";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agency workspace helpers", () => {
  it("applies account limits from the effective plan", () => {
    expect(getInstagramAccountLimit("FREE", "NONE")).toBe(1);
    expect(getInstagramAccountLimit("AGENCY", "ACTIVE")).toBe(10);
    expect(getInstagramAccountLimit("AGENCY", "PAST_DUE")).toBe(1);
  });

  it("allows reconnecting an account already owned by the workspace", async () => {
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({
      workspaceId: "workspace_123",
    });

    await expect(
      canConnectInstagramAccount({
        workspaceId: "workspace_123",
        plan: "FREE",
        subscriptionStatus: "NONE",
        instagramId: "ig_123",
      })
    ).resolves.toMatchObject({ allowed: true, reason: null, limit: 1 });
    expect(mockPrisma.instagramAccount.count).not.toHaveBeenCalled();
  });

  it("blocks accounts already connected to another workspace", async () => {
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({
      workspaceId: "workspace_other",
    });

    await expect(
      canConnectInstagramAccount({
        workspaceId: "workspace_123",
        plan: "AGENCY",
        subscriptionStatus: "ACTIVE",
        instagramId: "ig_123",
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "already_connected",
      limit: 10,
    });
  });

  it("blocks new account connections when the plan account limit is reached", async () => {
    mockPrisma.instagramAccount.findUnique.mockResolvedValue(null);
    mockPrisma.instagramAccount.count.mockResolvedValue(1);

    await expect(
      canConnectInstagramAccount({
        workspaceId: "workspace_123",
        plan: "PRO",
        subscriptionStatus: "ACTIVE",
        instagramId: "ig_123",
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "plan_limit",
      limit: 1,
    });
  });

  it("selects a requested workspace account or falls back to the latest account", async () => {
    mockPrisma.instagramAccount.findFirst.mockResolvedValue({ id: "account_1" });

    await getWorkspaceInstagramAccount("workspace_123", "account_1");
    expect(mockPrisma.instagramAccount.findFirst).toHaveBeenCalledWith({
      where: { id: "account_1", workspaceId: "workspace_123" },
    });

    await getWorkspaceInstagramAccount("workspace_123", "all");
    expect(mockPrisma.instagramAccount.findFirst).toHaveBeenLastCalledWith({
      where: { workspaceId: "workspace_123" },
      orderBy: { connectedAt: "desc" },
    });
  });

  it("normalizes invitation emails and builds invite URLs", () => {
    expect(normalizeInvitationEmail(" Team@Agency.COM ")).toBe(
      "team@agency.com"
    );
    expect(buildInvitationUrl("token_123", "https://campaigncue.com/")).toBe(
      "https://campaigncue.com/invite/token_123"
    );
  });
});

