/**
 * Anti-cliché linter for YOYAKU DM copy.
 *
 * Ported from the proven email style guard (pretooluse-email-cascade-guard.py
 * check_style) and extended with the tics observed in the legacy ManyChat
 * campaigns. A rejected text never becomes a campaign: the linter is a hard
 * gate at generation time and a warning surface for manual edits.
 *
 * The one rule that is not cosmetic: every proper noun in the text must come
 * from the fact block. This is the executable form of rules/01 "NEVER invent
 * or sharpen a name".
 */

import { META_BODY_LIMIT, META_BUTTON_LIMIT } from "./yoyaku-patterns";
import type { CampaignCopy } from "./yoyaku-patterns";
import { factNouns } from "./release-facts";
import type { CampaignFacts } from "./release-facts";

export interface LintViolation {
  rule: string;
  detail: string;
}

export interface LintResult {
  ok: boolean;
  violations: LintViolation[];
}

const EMOJI = /\p{Extended_Pictographic}|️/u;
const DASHES = /[—–]/;

const BAD_OPENINGS = /^(hey|hey there|hi there|hello there)\b/i;

const CLICHES: readonly RegExp[] = [
  /\bdive (in|into)\b/i,
  /\bworld of\b/i,
  /\b\w+'s world\b/i,
  /\bjourney\b/i,
  /\bfresh (perspective|take)\b/i,
  /\b(elevate|unlock|leverage|showcase|streamline|empower|foster|amplify|curate)\b/i,
  /\bgame.?changer\b/i,
];

const RHETORICAL_HOOKS: readonly RegExp[] = [
  /you'?re in the right place/i,
  /\bwanna (hear|see|listen)\b/i,
  /\blet'?s listen\b/i,
  /^looking for\b/i,
  /\bready to\b/i,
];

const FAKE_PERSONALIZATION: readonly RegExp[] = [
  /i hope this (email|message|note) finds you well/i,
  /i wanted to personally reach out/i,
  /please (do not|don'?t) hesitate/i,
  /feel free to (contact|reach out|get in touch)/i,
  /looking forward to hearing/i,
];

/** Three-item "X, Y, and Z" lists — the adjective-triad tell. */
const TRIAD = /,[^,.!?]+,\s*and\s+/i;

/**
 * Words our hand-written shells legitimately capitalize outside fact nouns.
 * Anything else capitalized must appear in the fact block.
 */
const ALLOWED_CAPITALIZED = new Set([
  "preorder",
  "preorders",
  "restock",
  "new",
  "out",
  "copies",
  "here",
  "there",
  "the",
  "full",
  "send",
  "get",
  "watch",
  "youtube",
  "soundcloud",
  "instore",
  "yoyaku",
]);

function collectFactWords(nouns: string[]): Set<string> {
  const words = new Set<string>();
  for (const noun of nouns) {
    words.add(noun.toLowerCase());
    for (const word of noun.split(/[\s/&.,'-]+/)) {
      if (word) words.add(word.toLowerCase());
    }
  }
  return words;
}

function findInventedNouns(text: string, nouns: string[]): string[] {
  const factWords = collectFactWords(nouns);
  const invented: string[] = [];

  for (const match of text.matchAll(/\b[A-Z][A-Za-z0-9'&-]*\b/g)) {
    const word = match[0];
    const lower = word.toLowerCase();
    if (ALLOWED_CAPITALIZED.has(lower)) continue;
    if (factWords.has(lower)) continue;
    // All-caps tokens that are substrings of a fact (catno fragments) pass.
    if (nouns.some((noun) => noun.toLowerCase().includes(lower))) continue;
    invented.push(word);
  }

  return invented;
}

export function lintText(text: string, nouns: string[]): LintViolation[] {
  const violations: LintViolation[] = [];
  const add = (rule: string, detail: string) => violations.push({ rule, detail });

  if (EMOJI.test(text)) add("no-emoji", "emoji are off-brand on YOYAKU accounts");
  if (DASHES.test(text)) add("no-dashes", "em/en dashes are banned (rules/01)");
  if (BAD_OPENINGS.test(text.trim())) add("no-hey-opening", `starts with a filler greeting`);

  for (const pattern of CLICHES) {
    const hit = text.match(pattern);
    if (hit) add("cliche", `"${hit[0]}"`);
  }
  for (const pattern of RHETORICAL_HOOKS) {
    const hit = text.match(pattern);
    if (hit) add("rhetorical-hook", `"${hit[0]}"`);
  }
  for (const pattern of FAKE_PERSONALIZATION) {
    const hit = text.match(pattern);
    if (hit) add("fake-personalization", `"${hit[0]}"`);
  }

  if (TRIAD.test(text)) add("adjective-triad", "three-item list reads as marketing");

  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 1) add("exclamation-overload", `${exclamations} exclamation marks`);

  const inventedNouns = findInventedNouns(text, nouns);
  if (inventedNouns.length > 0) {
    add(
      "invented-noun",
      `proper noun(s) not in the fact block: ${inventedNouns.join(", ")}`
    );
  }

  return violations;
}

/** Lint every user-visible field of a campaign against its fact block. */
export function lintCampaignCopy(
  copy: CampaignCopy,
  facts: CampaignFacts
): LintResult {
  const nouns = factNouns(facts);
  const violations: LintViolation[] = [];

  for (const [field, value] of [
    ["openingDmMessage", copy.openingDmMessage],
    ["dmMessage", copy.dmMessage],
  ] as const) {
    for (const violation of lintText(value, nouns)) {
      violations.push({ ...violation, detail: `${field}: ${violation.detail}` });
    }
    if (value.length > META_BODY_LIMIT) {
      violations.push({
        rule: "meta-body-limit",
        detail: `${field} is ${value.length} chars (limit ${META_BODY_LIMIT})`,
      });
    }
  }

  for (const [field, value] of [
    ["openingDmButtonLabel", copy.openingDmButtonLabel],
    ["linkButtonLabel", copy.linkButtonLabel],
    ["secondaryButtonLabel", copy.secondaryButtonLabel ?? ""],
  ] as const) {
    if (value.length > META_BUTTON_LIMIT) {
      violations.push({
        rule: "meta-button-limit",
        detail: `${field} is ${value.length} chars (limit ${META_BUTTON_LIMIT})`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
