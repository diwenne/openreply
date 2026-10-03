import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "test-workspace" }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
import { POST } from "@/app/api/automations/validate/route";

describe("simulation body validation", () => {
  it("rejects malformed JSON without an unhandled server exception", async () => {
    const response = await POST(new NextRequest("http://localhost/api/automations/validate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "Invalid JSON" });
  });
  it("bounds streamed bodies independently of content-length", async () => {
    const response = await POST(new NextRequest("http://localhost/api/automations/validate", {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1" }, body: JSON.stringify({ text: "a".repeat(70_000) }),
    }));
    expect(response.status).toBe(413);
  });
  it("requires a JSON content type", async () => {
    const response = await POST(new NextRequest("http://localhost/api/automations/validate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(415);
  });
  it("rejects foreign browser origins before accessing campaign data", async () => {
    const response = await POST(new NextRequest("http://localhost/api/automations/validate", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://foreign.example.test" }, body: "{}",
    }));
    expect(response.status).toBe(403);
  });
});
