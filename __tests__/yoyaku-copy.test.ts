import { describe, expect, it } from "vitest";
import {
  buildCampaignCopy,
  META_BODY_LIMIT,
  META_BUTTON_LIMIT,
} from "@/lib/copy/yoyaku-patterns";
import { lintCampaignCopy, lintText } from "@/lib/copy/copy-linter";
import { factNouns, missingFacts } from "@/lib/copy/release-facts";
import type { InstoreFacts, ReleaseFacts } from "@/lib/copy/release-facts";

const RELEASE: ReleaseFacts = {
  eventType: "preorder_open",
  artist: "Theo Kottis",
  title: "Pressure EP",
  catno: "TO001",
  label: "Yoyaku",
  url: "https://yoyaku.io/release/theo-kottis-pressure-ep-to001/",
};

const INSTORE: InstoreFacts = {
  eventType: "instore_published",
  artist: "Didier Allyne",
  youtubeUrl: "https://youtu.be/dBGjgTg5_DM",
  soundcloudUrl: "https://soundcloud.com/yoyaku",
};

describe("release facts", () => {
  it("flags missing fields instead of inventing them", () => {
    expect(missingFacts({ ...RELEASE, label: " " })).toEqual(["label"]);
    expect(missingFacts(RELEASE)).toEqual([]);
    expect(missingFacts({ ...INSTORE, youtubeUrl: "" })).toEqual(["youtubeUrl"]);
  });
});

describe("yoyaku patterns", () => {
  const eventTypes = ["preorder_open", "release_live", "restock"] as const;

  it.each(eventTypes)("%s copy passes the linter", (eventType) => {
    const facts = { ...RELEASE, eventType };
    const copy = buildCampaignCopy(facts);
    const result = lintCampaignCopy(copy, facts);
    expect(result.violations).toEqual([]);
    expect(copy.openingDmMessage.length).toBeLessThanOrEqual(META_BODY_LIMIT);
    expect(copy.linkButtonLabel.length).toBeLessThanOrEqual(META_BUTTON_LIMIT);
    expect(copy.trackedDestinationUrl).toBe(RELEASE.url);
  });

  it("instore copy passes and carries both platform links", () => {
    const copy = buildCampaignCopy(INSTORE);
    expect(lintCampaignCopy(copy, INSTORE).violations).toEqual([]);
    expect(copy.trackedDestinationUrl).toBe(INSTORE.youtubeUrl);
    expect(copy.secondaryDestinationUrl).toBe(INSTORE.soundcloudUrl);
    expect(copy.secondaryButtonLabel).toBe("SoundCloud");
  });

  it("is deterministic for the same release", () => {
    expect(buildCampaignCopy(RELEASE)).toEqual(buildCampaignCopy(RELEASE));
  });

  it("keeps the preorder button inside Meta's 20-char limit", () => {
    const short = buildCampaignCopy(RELEASE);
    expect(short.linkButtonLabel).toBe("Preorder TO001");

    const long = buildCampaignCopy({ ...RELEASE, catno: "STICKYPLASTICK002" });
    expect(long.linkButtonLabel.length).toBeLessThanOrEqual(META_BUTTON_LIMIT);
    expect(long.linkButtonLabel).toContain("STICKYPLASTICK");
  });
});

describe("copy linter — the real ManyChat copy is rejected", () => {
  const nouns = factNouns(RELEASE);

  const manychatSamples: Array<[string, string]> = [
    ["Hey! Amor Fati is here with Dj Strangelove upcoming release 🌟", "no-hey-opening"],
    ["Dive into Studio HC Orchestra's world 🌊", "cliche"],
    [
      "Theo Kottis with his fresh perspective of the classics on the wax. Wanna hear it?",
      "cliche",
    ],
    [
      "Looking for some stripped minimal sounds, deep textures, and hypnotic grooves? You're in the right place",
      "adjective-triad",
    ],
    ["ZZZ Series is coming out with the third release on vinyl 🖤 Let's listen?", "no-emoji"],
  ];

  it.each(manychatSamples)("rejects: %s", (text, expectedRule) => {
    const violations = lintText(text, nouns);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.rule)).toContain(expectedRule);
  });

  it("rejects every emoji, not just the second one", () => {
    expect(lintText("Preorder is open 🎶", nouns).map((v) => v.rule)).toContain(
      "no-emoji"
    );
  });

  it("rejects em and en dashes", () => {
    expect(lintText("Theo Kottis — Pressure EP", nouns).map((v) => v.rule)).toContain(
      "no-dashes"
    );
  });

  it("rejects proper nouns that are not in the fact block", () => {
    const violations = lintText("Pressure EP by Ricardo Villalobos.", nouns);
    const invented = violations.find((v) => v.rule === "invented-noun");
    expect(invented).toBeDefined();
    expect(invented?.detail).toContain("Ricardo");
  });

  it("accepts fact nouns and shell vocabulary", () => {
    expect(
      lintText("Theo Kottis, Pressure EP. Preorder is open on Yoyaku.", nouns)
    ).toEqual([]);
  });

  it("rejects oversize fields via the campaign-level lint", () => {
    const copy = buildCampaignCopy(RELEASE);
    const result = lintCampaignCopy(
      { ...copy, openingDmButtonLabel: "A far too long button label" },
      RELEASE
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("meta-button-limit");
  });
});
