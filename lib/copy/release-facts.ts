/**
 * The fact block every YOYAKU DM is built from.
 *
 * Facts are resolved mechanically from the shop (never invented, never
 * sharpened) and flow into hand-written patterns. If a required fact is
 * missing the campaign is NOT created; nothing is ever filled in.
 */

export type ReleaseEventType =
  | "preorder_open"
  | "release_live"
  | "restock"
  | "instore_published";

export interface ReleaseFacts {
  eventType: Exclude<ReleaseEventType, "instore_published">;
  artist: string;
  title: string;
  /** Catalogue number — equals the WooCommerce SKU across the ecosystem. */
  catno: string;
  label: string;
  /** Public product URL, always https://yoyaku.io/release/<slug>/ */
  url: string;
}

export interface InstoreFacts {
  eventType: "instore_published";
  artist: string;
  youtubeUrl: string;
  /** Artist SoundCloud when set, otherwise the shop's channel. */
  soundcloudUrl: string;
}

export type CampaignFacts = ReleaseFacts | InstoreFacts;

/** Every proper-noun-bearing value of the fact block, for linter cross-checks. */
export function factNouns(facts: CampaignFacts): string[] {
  if (facts.eventType === "instore_published") {
    return [facts.artist, "Yoyaku"];
  }

  return [facts.artist, facts.title, facts.catno, facts.label, "Yoyaku"];
}

const REQUIRED_RELEASE_FIELDS = [
  "artist",
  "title",
  "catno",
  "label",
  "url",
] as const;

const REQUIRED_INSTORE_FIELDS = ["artist", "youtubeUrl", "soundcloudUrl"] as const;

/** Returns the missing field names; an empty array means the block is usable. */
export function missingFacts(facts: CampaignFacts): string[] {
  const required =
    facts.eventType === "instore_published"
      ? REQUIRED_INSTORE_FIELDS
      : REQUIRED_RELEASE_FIELDS;

  return required.filter((field) => {
    const value = (facts as unknown as Record<string, unknown>)[field];
    return typeof value !== "string" || value.trim() === "";
  });
}
