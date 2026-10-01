import { describe, expect, it } from "vitest";
import {
  calculateCtr,
  countUniqueClicks,
  countUniqueClicksBy,
  normalizeTopKeywords,
  summarizeDmStatuses,
} from "../lib/tracking/analytics";
import { hashRecipientId, parseRecipientToken } from "../lib/tracking/server";
import {
  buildTrackedUrl,
  extractFirstUrl,
  renderMessageWithTracking,
  replaceUrlWithTrackedPlaceholder,
} from "../lib/tracking/message";

describe("tracked link messages", () => {
  it("extracts a destination URL and replaces it with the tracked placeholder", () => {
    const message =
      "Hey {username}, here is your guide: https://example.com/guide.";
    const url = extractFirstUrl(message);

    expect(url).toBe("https://example.com/guide");
    expect(replaceUrlWithTrackedPlaceholder(message, url)).toBe(
      "Hey {username}, here is your guide: {link}."
    );
  });

  it("renders tracked URLs with username personalization", () => {
    expect(
      renderMessageWithTracking({
        message: "Hey {username}, grab it here: {link}",
        commenterName: "Maya",
        trackedLinks: [
          {
            slug: "abc123",
            destinationUrl: "https://example.com/guide",
          },
        ],
        baseUrl: "https://manychat-alternative.com",
      })
    ).toBe("Hey Maya, grab it here: https://manychat-alternative.com/r/abc123");
  });

  it("can replace a raw destination URL when the placeholder is missing", () => {
    expect(
      renderMessageWithTracking({
        message: "Link: https://example.com/guide",
        trackedLinks: [
          {
            slug: "abc123",
            destinationUrl: "https://example.com/guide",
          },
        ],
        baseUrl: "https://manychat-alternative.com/",
      })
    ).toBe("Link: https://manychat-alternative.com/r/abc123");
  });

  it("matches normalized root URLs with or without trailing slash", () => {
    expect(
      replaceUrlWithTrackedPlaceholder("Link: https://example.com", "https://example.com/")
    ).toBe("Link: {link}");
    expect(
      renderMessageWithTracking({
        message: "Link: https://example.com",
        trackedLinks: [
          {
            slug: "abc123",
            destinationUrl: "https://example.com/",
          },
        ],
        baseUrl: "https://manychat-alternative.com",
      })
    ).toBe("Link: https://manychat-alternative.com/r/abc123");
  });

  it("builds redirect URLs from a base URL", () => {
    expect(buildTrackedUrl("abc123", "https://manychat-alternative.com/")).toBe(
      "https://manychat-alternative.com/r/abc123"
    );
  });
});

describe("campaign analytics helpers", () => {
  it("summarizes DM status rows", () => {
    expect(
      summarizeDmStatuses([
        { status: "SENT", _count: 20 },
        { status: "FAILED", _count: 2 },
        { status: "SKIPPED_RATE_LIMIT", _count: 3 },
        { status: "SKIPPED_PLAN_LIMIT", _count: 1 },
      ])
    ).toEqual({ sent: 20, skipped: 4, failed: 2 });
  });

  it("calculates CTR and handles empty send volume", () => {
    expect(calculateCtr(5, 20)).toBe(25);
    expect(calculateCtr(2, 3)).toBe(66.7);
    expect(calculateCtr(5, 0)).toBe(0);
  });

  it("normalizes top keywords by count", () => {
    expect(
      normalizeTopKeywords([
        { matchedKeyword: "PRICE", _count: 3 },
        { matchedKeyword: null, _count: 9 },
        { matchedKeyword: "LINK", _count: 7 },
      ])
    ).toEqual([
      { keyword: "LINK", count: 7 },
      { keyword: "PRICE", count: 3 },
    ]);
  });
});

describe("per-recipient click tracking", () => {
  it("adds a recipient token to tracked URLs and messages", () => {
    expect(
      buildTrackedUrl("abc123", "https://manychat-alternative.com", "tok")
    ).toBe("https://manychat-alternative.com/r/abc123?r=tok");
    expect(
      renderMessageWithTracking({
        message: "Grab it here: {link}",
        trackedLinks: [
          { slug: "abc123", destinationUrl: "https://example.com/guide" },
        ],
        baseUrl: "https://manychat-alternative.com",
        recipientToken: "tok",
      })
    ).toBe("Grab it here: https://manychat-alternative.com/r/abc123?r=tok");
  });

  it("derives a stable, URL-safe token that hides the recipient ID", () => {
    const token = hashRecipientId("17841400000000001");

    expect(token).toBe(hashRecipientId("17841400000000001"));
    expect(token).not.toBe(hashRecipientId("17841400000000002"));
    expect(token).not.toContain("17841400000000001");
    expect(parseRecipientToken(token)).toBe(token);
  });

  it("ignores missing or malformed tokens", () => {
    expect(parseRecipientToken(null)).toBeNull();
    expect(parseRecipientToken("")).toBeNull();
    expect(parseRecipientToken("too-short")).toBeNull();
    expect(parseRecipientToken("x".repeat(500))).toBeNull();
    expect(parseRecipientToken("<script>alert(1)</script>xxxxx")).toBeNull();
  });

  it("counts each person once per campaign", () => {
    const row = (
      id: string,
      automationId: string,
      recipientHash: string | null,
      ipHash: string | null
    ) => ({ id, automationId, recipientHash, ipHash });

    const rows = [
      // One recipient tapping twice, from two networks, counts once.
      row("c1", "campaign_a", "person_1", "wifi_ip"),
      row("c2", "campaign_a", "person_1", "mobile_ip"),
      // Older clicks without a token fall back to the IP hash.
      row("c3", "campaign_a", null, "ip_x"),
      row("c4", "campaign_a", null, "ip_x"),
      // With neither, every click counts.
      row("c5", "campaign_a", null, null),
      row("c6", "campaign_a", null, null),
      // The same person in another campaign counts there too.
      row("c7", "campaign_b", "person_1", "wifi_ip"),
    ];

    expect(countUniqueClicks(rows)).toBe(5);
    expect(countUniqueClicksBy(rows, (r) => r.automationId)).toEqual(
      new Map([
        ["campaign_a", 4],
        ["campaign_b", 1],
      ])
    );
  });
});
