/**
 * YOYAKU voice — hand-written DM patterns.
 *
 * Doctrine (rules/01 §Human-facing Writing + manychat-bible): say what
 * happens, who does what, what is expected, then stop. Real facts poured
 * into short shells. No emoji, ever. No em/en dashes. No rhetorical hooks,
 * no adjective triads, no invented names. The linter in ./copy-linter.ts
 * enforces all of this at generation time.
 *
 * Meta hard limits encoded here (lib/meta/client.ts): button-template body
 * 640 chars, button title 20 chars (silently truncated beyond), 3 buttons.
 */

import type { CampaignFacts, InstoreFacts, ReleaseFacts } from "./release-facts";

export const META_BODY_LIMIT = 640;
export const META_BUTTON_LIMIT = 20;

export interface CampaignCopy {
  /** Campaign name shown in the OpenReply UI. */
  name: string;
  goal: string;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  /** The reveal DM that carries the link button(s). */
  dmMessage: string;
  /** Label of the primary link button (≤20 chars). */
  linkButtonLabel: string;
  trackedDestinationUrl: string;
  secondaryDestinationUrl?: string;
  secondaryButtonLabel?: string;
}

/**
 * Deterministic variant pick: the same release always renders the same copy,
 * so re-running the sync is idempotent and reviewable. Date.now()/random are
 * deliberately absent.
 */
function pickVariant<T>(variants: readonly T[], seed: string): T {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return variants[hash % variants.length];
}

/** "Preorder ABC123" when it fits Meta's 20-char button, plain catno otherwise. */
function preorderButtonLabel(catno: string): string {
  const labeled = `Preorder ${catno}`;
  if (labeled.length <= META_BUTTON_LIMIT) return labeled;
  return catno.slice(0, META_BUTTON_LIMIT);
}

const OPENING_BUTTON_VARIANTS = ["Send the link", "Get the link"] as const;

const REVEAL_VARIANTS = ["Here you go:", "There you go:"] as const;

type ReleaseShell = (facts: ReleaseFacts) => string;

const RELEASE_OPENINGS: Record<ReleaseFacts["eventType"], readonly ReleaseShell[]> = {
  preorder_open: [
    (f) => `${f.artist}, ${f.title}. Preorder is open on ${f.label}.`,
    (f) => `${f.title} by ${f.artist} is up for preorder on ${f.label}.`,
    (f) => `New on ${f.label}: ${f.artist}, ${f.title}. Preorders are open.`,
  ],
  release_live: [
    (f) => `${f.artist}, ${f.title} is out now on ${f.label}.`,
    (f) => `${f.title} by ${f.artist} just landed. Copies are in the shop.`,
    (f) => `Out today: ${f.artist}, ${f.title} on ${f.label}.`,
  ],
  restock: [
    (f) => `${f.artist}, ${f.title} is back in stock.`,
    (f) => `Restock: ${f.artist}, ${f.title} on ${f.label}.`,
  ],
};

const RELEASE_GOALS: Record<ReleaseFacts["eventType"], string> = {
  preorder_open: "Preorder link",
  release_live: "Release link",
  restock: "Restock link",
};

const INSTORE_OPENINGS: readonly ((facts: InstoreFacts) => string)[] = [
  (f) => `${f.artist} played an instore session at Yoyaku. The full set is up.`,
  (f) => `New instore session: ${f.artist} at Yoyaku.`,
];

export function buildCampaignCopy(facts: CampaignFacts): CampaignCopy {
  if (facts.eventType === "instore_published") {
    return {
      name: `Instore ${facts.artist}`,
      goal: "Instore session links",
      openingDmMessage: pickVariant(INSTORE_OPENINGS, facts.artist)(facts),
      openingDmButtonLabel: "Watch",
      dmMessage: pickVariant(REVEAL_VARIANTS, facts.artist),
      linkButtonLabel: "YouTube",
      trackedDestinationUrl: facts.youtubeUrl,
      secondaryDestinationUrl: facts.soundcloudUrl,
      secondaryButtonLabel: "SoundCloud",
    };
  }

  const opening = pickVariant(RELEASE_OPENINGS[facts.eventType], facts.catno)(facts);

  return {
    name: `${facts.catno} ${RELEASE_GOALS[facts.eventType]}`,
    goal: RELEASE_GOALS[facts.eventType],
    openingDmMessage: opening,
    openingDmButtonLabel: pickVariant(OPENING_BUTTON_VARIANTS, facts.catno),
    dmMessage: pickVariant(REVEAL_VARIANTS, facts.catno),
    linkButtonLabel:
      facts.eventType === "preorder_open"
        ? preorderButtonLabel(facts.catno)
        : facts.catno.slice(0, META_BUTTON_LIMIT),
    trackedDestinationUrl: facts.url,
  };
}
