import { describe, expect, it } from "vitest";
import {
  calculateCtr,
  normalizeTopKeywords,
  summarizeDmStatuses,
} from "../lib/tracking/analytics";
import {
  buildTrackedUrl,
  buildTrackingSrc,
  extractFirstUrl,
  isValidTrackingSrc,
  renderMessageWithTracking,
  replaceUrlWithTrackedPlaceholder,
  TRACKING_SRC_PATTERN,
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

describe("per-post attribution src", () => {
  it("builds an ig<mediaId> token from a real Instagram media id", () => {
    // Instagram media ids are 17-18 digits: "ig" + id is 19-20 chars.
    const src = buildTrackingSrc("17912345678901234");

    expect(src).toBe("ig17912345678901234");
    expect(src).toHaveLength(19);
    expect(TRACKING_SRC_PATTERN.test(src as string)).toBe(true);
  });

  it("stays inside the 24-character whitelist for an 18-digit id", () => {
    const src = buildTrackingSrc("179123456789012345");

    expect(src).toBe("ig179123456789012345");
    expect(TRACKING_SRC_PATTERN.test(src as string)).toBe(true);
  });

  it("lowercases and strips characters the whitelist rejects", () => {
    expect(buildTrackingSrc("Media_101")).toBe("igmedia101");
    expect(buildTrackingSrc("abc-DEF")).toBe("igabc-def");
  });

  it("truncates to 24 characters rather than dropping attribution", () => {
    const src = buildTrackingSrc("1".repeat(40));

    expect(src).toHaveLength(24);
    expect(src).toBe(`ig${"1".repeat(22)}`);
    expect(TRACKING_SRC_PATTERN.test(src as string)).toBe(true);
  });

  it("returns null when there is no media or nothing usable survives", () => {
    expect(buildTrackingSrc(null)).toBeNull();
    expect(buildTrackingSrc(undefined)).toBeNull();
    expect(buildTrackingSrc("")).toBeNull();
    expect(buildTrackingSrc("___")).toBeNull();
  });

  it("validates tokens against the destination whitelist", () => {
    expect(isValidTrackingSrc("ig17912345678901234")).toBe(true);
    expect(isValidTrackingSrc("IG179")).toBe(false);
    expect(isValidTrackingSrc("ig_179")).toBe(false);
    expect(isValidTrackingSrc("a".repeat(25))).toBe(false);
    expect(isValidTrackingSrc("")).toBe(false);
    expect(isValidTrackingSrc(null)).toBe(false);
  });

  it("appends a valid src to the tracked URL and ignores an invalid one", () => {
    expect(
      buildTrackedUrl("abc123", "https://reply.maisondeplume.com", "ig17912345678901234")
    ).toBe("https://reply.maisondeplume.com/r/abc123?src=ig17912345678901234");

    expect(
      buildTrackedUrl("abc123", "https://reply.maisondeplume.com", "NOT VALID")
    ).toBe("https://reply.maisondeplume.com/r/abc123");

    expect(buildTrackedUrl("abc123", "https://reply.maisondeplume.com", null)).toBe(
      "https://reply.maisondeplume.com/r/abc123"
    );
  });

  it("renders the src into the message's tracked link", () => {
    expect(
      renderMessageWithTracking({
        message: "Hey {username}, vote here: {link}",
        commenterName: "Maya",
        trackedLinks: [
          { slug: "abc123", destinationUrl: "https://links.maisondeplume.com/films" },
        ],
        baseUrl: "https://reply.maisondeplume.com",
        src: "ig17912345678901234",
      })
    ).toBe(
      "Hey Maya, vote here: https://reply.maisondeplume.com/r/abc123?src=ig17912345678901234"
    );
  });

  it("renders exactly as before when no src is supplied", () => {
    expect(
      renderMessageWithTracking({
        message: "Vote here: {link}",
        trackedLinks: [
          { slug: "abc123", destinationUrl: "https://links.maisondeplume.com/films" },
        ],
        baseUrl: "https://reply.maisondeplume.com",
      })
    ).toBe("Vote here: https://reply.maisondeplume.com/r/abc123");
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
