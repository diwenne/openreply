import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), prisma: {
  automation: { findFirst: vi.fn() }, deliveryEvent: { findMany: vi.fn() },
  campaignRevision: { findMany: vi.fn() },
  integrationEvent: { groupBy: vi.fn() },
} }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: mocks.workspace }));
vi.mock("@/lib/db/client", () => ({ prisma: mocks.prisma }));
import { GET } from "@/app/api/campaigns/history/route";
import { deliveryHistorySelect, safeDeliveryHistory } from "@/lib/queue/delivery-history";
const request = (id = "campaign") => new NextRequest(`https://example.test/api/campaigns/history${id ? `?id=${id}` : ""}`);
beforeEach(() => {
  vi.resetAllMocks(); mocks.workspace.mockResolvedValue("workspace");
  mocks.prisma.automation.findFirst.mockResolvedValue({ id: "campaign", lifecycle: "ACTIVE", version: 3 });
  mocks.prisma.deliveryEvent.findMany.mockResolvedValue([]);
  mocks.prisma.campaignRevision.findMany.mockResolvedValue([]);
  mocks.prisma.integrationEvent.groupBy.mockResolvedValue([]);
});
describe("private delivery timeline", () => {
  it("requires authentication before querying campaign or delivery state", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.prisma.automation.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.deliveryEvent.findMany).not.toHaveBeenCalled();
  });
  it("rejects missing campaign IDs without reading events", async () => {
    expect((await GET(request(""))).status).toBe(400);
    expect(mocks.prisma.deliveryEvent.findMany).not.toHaveBeenCalled();
  });
  it("does not expose a campaign outside the current workspace", async () => {
    mocks.prisma.automation.findFirst.mockResolvedValue(null);
    expect((await GET(request("foreign-campaign"))).status).toBe(404);
    expect(mocks.prisma.automation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign-campaign", workspaceId: "workspace" } }));
    expect(mocks.prisma.deliveryEvent.findMany).not.toHaveBeenCalled();
  });
  it("uses workspace-bound whitelists, stable limits and credential-redacted errors", async () => {
    mocks.prisma.deliveryEvent.findMany.mockResolvedValue([{ id: "event", stage: "REVEAL", status: "UNCONFIRMED", campaignVersion: 2,
      message: "Saved content", error: "https://example.test?access_token=private-value", recipientId: "private-recipient", payload: { accessToken: "private-token" }, operationKey: "private-operation" }]);
    mocks.prisma.campaignRevision.findMany.mockResolvedValue([{ id: "revision", actorId: "system:test", createdAt: new Date(), snapshot: { version: 2, accessToken: "private-token", trackedLinks: [] } }]);
    const response = await GET(request());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({ campaign: { version: 3 }, delivery: [{ campaignVersion: 2, status: "UNCONFIRMED" }], limits: { delivery: 100, revisions: 50 } });
    expect(mocks.prisma.deliveryEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "workspace", automationId: "campaign" }, select: deliveryHistorySelect, take: 100 }));
    for (const secret of ["private-value", "private-recipient", "private-token", "private-operation"]) expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.data.delivery[0].error).toContain("[redacted]");
    expect(body.data.conversions).toEqual([]);
  });
  it("returns only workspace-scoped conversion totals, never subject references or payloads", async () => {
    mocks.prisma.integrationEvent.groupBy.mockResolvedValue([{ eventType: "conversion.form_completed", _count: { _all: 2 }, payload: { subjectRef: "private-reference" } }]);
    const body = await (await GET(request())).json();
    expect(body.data.conversions).toEqual([{ eventType: "conversion.form_completed", count: 2 }]);
    expect(mocks.prisma.integrationEvent.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "workspace", automationId: "campaign",
      eventType: { in: ["conversion.resource_downloaded", "conversion.form_completed", "conversion.qualified_inquiry"] } } }));
    expect(JSON.stringify(body)).not.toContain("private-reference");
  });

  it("does not copy any unlisted recipient, provider or queue fields", () => {
    expect(safeDeliveryHistory({ id: "event", recipientId: "private", payload: { token: "private" }, operationKey: "private", error: "Bearer credential" })).not.toHaveProperty("recipientId");
    expect(JSON.stringify(safeDeliveryHistory({ error: "Bearer credential", payload: "private" }))).not.toContain("credential");
  });
});
