import { describe, expect, it } from "vitest";
import { isCommentRecoveryCampaign } from "../lib/polling/recovery-mode";

describe("comment recovery campaign selection", () => {
  it("enables recovery only for an exact campaign ID match", () => {
    expect(isCommentRecoveryCampaign("campaign_123", "campaign_123")).toBe(true);
    expect(isCommentRecoveryCampaign("campaign_123", "campaign_456")).toBe(false);
  });

  it("trims the configured campaign ID", () => {
    expect(isCommentRecoveryCampaign("campaign_123", "  campaign_123  ")).toBe(
      true
    );
  });

  it("stays disabled when no campaign ID is configured", () => {
    expect(isCommentRecoveryCampaign("campaign_123", undefined)).toBe(false);
    expect(isCommentRecoveryCampaign("campaign_123", "   ")).toBe(false);
  });
});
