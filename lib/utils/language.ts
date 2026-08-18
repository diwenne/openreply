/**
 * Picks the language of a reply from the keyword that matched the comment.
 *
 * Campaigns that serve a bilingual audience are written once, with each half
 * marked by a flag emoji:
 *
 *   🇮🇹 Ciao, vuoi scaricare gli sfondi?
 *
 *   🇺🇸 Hi! Are you interested in downloading the wallpapers?
 *
 * Someone commenting an Italian keyword then gets only the Italian half, and
 * an English keyword only the English one, instead of a message twice as long
 * as it needs to be.
 *
 * Which keyword maps to which language is configuration, not code: set
 * KEYWORD_LANGUAGES in the environment (see .env.example). When a keyword is
 * unmapped — the variable is unset, the campaign matches any word, or the
 * comment contains keywords of both languages — the language stays null and
 * the whole message goes out, exactly as it did before this feature existed.
 */

export const SUPPORTED_LANGUAGES = [
  "it",
  "en",
  "es",
  "fr",
  "de",
  "pt",
] as const;

export type Lang = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * The flag that opens each half of a bilingual message. A language can only be
 * split out if its flag is listed here.
 */
const LANGUAGE_FLAGS: Record<Lang, string> = {
  it: "🇮🇹",
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  pt: "🇵🇹",
};

/**
 * Tokens that belong to no language in particular. They are usually written
 * once at the very end of the message, after the last half, so a naive cut
 * would drop the link for everyone but the reader of the final language.
 */
const NEUTRAL_TOKENS = [/\{link\}/i];

export function isLang(value: unknown): value is Lang {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Parses KEYWORD_LANGUAGES: a comma-separated list of `keyword:lang` pairs,
 * e.g. "sfondi:it, wallpaper:en, wallpapers:en". Keywords are compared
 * lowercased and trimmed; unknown languages and malformed pairs are skipped
 * rather than throwing, so a typo in the environment degrades to bilingual
 * messages instead of breaking the worker.
 */
function parseKeywordLanguages(raw: string | undefined): Map<string, Lang> {
  const map = new Map<string, Lang>();
  if (!raw) return map;

  for (const pair of raw.split(",")) {
    const separator = pair.lastIndexOf(":");
    if (separator === -1) continue;

    const keyword = pair.slice(0, separator).trim().toLowerCase();
    const lang = pair.slice(separator + 1).trim().toLowerCase();
    if (keyword && isLang(lang)) map.set(keyword, lang);
  }

  return map;
}

// Read once: the worker is long-lived and the variable cannot change without
// a restart.
const KEYWORD_LANGUAGE = parseKeywordLanguages(process.env.KEYWORD_LANGUAGES);

export function languageForKeyword(
  keyword: string | null | undefined
): Lang | null {
  if (!keyword) return null;
  return KEYWORD_LANGUAGE.get(keyword.trim().toLowerCase()) ?? null;
}

/**
 * Re-attaches the neutral tokens that the chosen half does not contain, so a
 * {link} written at the bottom of the message survives the cut.
 */
function preserveTokens(section: string, full: string): string {
  let out = section;

  for (const token of NEUTRAL_TOKENS) {
    if (token.test(full) && !token.test(out)) {
      const match = token.exec(full);
      if (match) out = `${out.trim()}\n\n${match[0]}`;
    }
  }

  return out;
}

/** Every flag present in the message, in the order they appear. */
function findFlags(message: string): { lang: Lang; at: number }[] {
  return SUPPORTED_LANGUAGES.map((lang) => ({
    lang,
    at: message.indexOf(LANGUAGE_FLAGS[lang]),
  }))
    .filter((flag) => flag.at !== -1)
    .sort((a, b) => a.at - b.at);
}

/**
 * Extracts the half of the message written in the requested language.
 *
 * Returns the message untouched when the language is unknown or the message is
 * not written in the bilingual format, so single-language campaigns keep
 * working without any change.
 *
 * `fallback` decides what happens with no language to go on: "full" keeps the
 * whole text and loses nothing, "first" keeps the half that comes first — see
 * pickLabel() for why button labels need the latter.
 */
export function pickLanguage(
  message: string,
  lang: Lang | null | undefined,
  fallback: "full" | "first" = "full"
): string {
  if (!message) return message;
  if (!lang && fallback === "full") return message;

  const flags = findFlags(message);
  // At least two flags are needed to cut: with a single one there is no way to
  // tell where one language ends and the next begins.
  if (flags.length < 2) return message;

  const index = lang ? flags.findIndex((flag) => flag.lang === lang) : 0;
  // The message is bilingual, but not in the language the keyword asked for:
  // sending the whole thing beats sending the wrong half.
  if (index === -1) return message;

  const start = flags[index].at + LANGUAGE_FLAGS[flags[index].lang].length;
  // A half runs up to the next flag, or to the end for the last one.
  const end = index + 1 < flags.length ? flags[index + 1].at : message.length;

  // The flag itself is dropped: with a single language left there is nothing
  // to signal, and the message reads less like a template.
  const section = message.slice(start, end).trim();
  if (!section) return message;

  return preserveTokens(section, message);
}

/**
 * Variant for button labels: always narrows down to one language, even when
 * the keyword does not name one, because Instagram truncates button titles at
 * 20 characters and a bilingual label would arrive cut mid-word.
 */
export function pickLabel(
  label: string | null | undefined,
  lang: Lang | null | undefined
): string {
  if (!label) return label ?? "";
  return pickLanguage(label, lang, "first");
}
