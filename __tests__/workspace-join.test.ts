import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceInvitation: { findMany: vi.fn() },
    workspaceMember: { findFirst: vi.fn(), upsert: vi.fn() },
    workspace: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { ensureWorkspaceForUser } from "../lib/workspace";

const OLDEST = { id: "ws_oldest", name: "b's workspace", ownerId: "user_b" };

describe("single-organization workspace join", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.workspaceInvitation.findMany.mockResolvedValue([]);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    mockPrisma.workspaceMember.upsert.mockResolvedValue({});
    mockPrisma.workspace.create.mockImplementation(
      async ({ data }: { data: { name: string } }) => ({
        id: "ws_new",
        name: data.name,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("joins the oldest workspace as MEMBER when the mode is enabled", async () => {
    vi.stubEnv("AUTH_JOIN_EXISTING_WORKSPACE", "true");
    mockPrisma.workspace.findFirst.mockResolvedValue(OLDEST);

    const workspace = await ensureWorkspaceForUser("user_anna", "anna@yoyaku.fr");

    expect(workspace.id).toBe("ws_oldest");
    expect(mockPrisma.workspaceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "MEMBER", userId: "user_anna" }),
      })
    );
    expect(mockPrisma.workspace.create).not.toHaveBeenCalled();
  });

  it("still creates an OWNER workspace for the very first user", async () => {
    vi.stubEnv("AUTH_JOIN_EXISTING_WORKSPACE", "true");
    mockPrisma.workspace.findFirst.mockResolvedValue(null);

    const workspace = await ensureWorkspaceForUser("user_first", "b@yoyaku.fr");

    expect(workspace.id).toBe("ws_new");
    expect(mockPrisma.workspace.create).toHaveBeenCalled();
  });

  it("keeps the upstream own-workspace behavior when the mode is off", async () => {
    vi.stubEnv("AUTH_JOIN_EXISTING_WORKSPACE", "false");

    const workspace = await ensureWorkspaceForUser("user_solo", "solo@yoyaku.fr");

    expect(workspace.id).toBe("ws_new");
    expect(mockPrisma.workspace.findFirst).not.toHaveBeenCalled();
  });

  it("prefers an existing membership over joining", async () => {
    vi.stubEnv("AUTH_JOIN_EXISTING_WORKSPACE", "true");
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({
      workspace: { id: "ws_mine" },
      role: "ADMIN",
    });

    const workspace = await ensureWorkspaceForUser("user_known", "known@yoyaku.fr");

    expect(workspace.id).toBe("ws_mine");
    expect(mockPrisma.workspaceMember.upsert).not.toHaveBeenCalled();
  });
});
