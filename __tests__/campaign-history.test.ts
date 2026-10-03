import { describe, expect, it } from "vitest";
import { safeDeliveryError, safeRevisionSnapshot } from "@/lib/campaigns/history";
describe("campaign audit projections", () => {
  it("whitelists snapshots and link fields, never internal access state", () => {
    expect(safeRevisionSnapshot({ name: "Campaign", version: 7, dmMessage: "Content", accessToken: "secret", workspaceId: "private", trackedLinks: [{ label: "Read", destinationUrl: "https://example.com", position: 0, slug: "private", token: "secret" }] })).toEqual({ name: "Campaign", version: 7, dmMessage: "Content", trackedLinks: [{ label: "Read", destinationUrl: "https://example.com", position: 0 }] });
    expect(safeRevisionSnapshot(null)).toEqual({});
    expect(safeRevisionSnapshot([])).toEqual({});
  });
  it("redacts common provider credential forms and bounds diagnostics", () => {
    const error = safeDeliveryError('https://example.com?access_token=abc&key=xyz Bearer bearer123 client_secret="secret123", password=pwd');
    for (const value of ["abc", "xyz", "bearer123", "secret123", "pwd"]) expect(error).not.toContain(value);
    expect(safeDeliveryError(null)).toBeNull();
    expect(safeDeliveryError("x".repeat(2000))).toHaveLength(1000);
  });
  it("projects only saved legacy destinations without inventing a version", () => {
    expect(safeRevisionSnapshot({ lifecycle: "DRAFT", trackedDestinationUrl: "https://example.com/old", secondaryDestinationUrl: "https://example.com/second", secondaryButtonLabel: "Second", accessToken: "discard" })).toEqual({
      lifecycle: "DRAFT", trackedLinks: [
        { label: null, destinationUrl: "https://example.com/old", position: 0 },
        { label: "Second", destinationUrl: "https://example.com/second", position: 1 },
      ],
    });
    expect(safeRevisionSnapshot({ trackedDestinationUrl: null, secondaryDestinationUrl: 123 })).toEqual({});
  });
  it("keeps recorded link arrays authoritative, including an explicitly empty array", () => {
    expect(safeRevisionSnapshot({ version: 1, trackedLinks: [], trackedDestinationUrl: "https://example.com/legacy" })).toEqual({ version: 1, trackedLinks: [] });
  });
});
