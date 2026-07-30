/**
 * Keyword Matcher
 *
 * Matches comment/story-reply text against a set of keywords with support for:
 * - Case-insensitive matching
 * - Accent-insensitive matching (« prière » ↔ "priere")
 * - Singular/plural tolerance ("maison" ↔ "maisons", "voeu" ↔ "voeux")
 * - Whole-word or partial matching
 * - Multi-keyword OR logic (any match = true)
 * - Emoji and special character stripping
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

/**
 * Strip emojis and special characters from text, keeping only
 * alphanumeric characters and whitespace.
 */
export function stripSpecialCharacters(text: string): string {
  // Fold accents to their base letters first (é→e, ï→i, ç→c…) — without this,
  // the [^\w\s] strip below turns accented letters into spaces and "prière"
  // can never match "priere".
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    )
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reduce a word to its singular base so plural and singular forms match both
 * ways ("maisons" → "maison", "voeux" → "voeu"). Words of 4 letters or fewer
 * keep their trailing s/x — stripping those would make short keywords match
 * far too loosely.
 */
function singularBase(word: string): string {
  if (word.length > 4 && /[sx]$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Normalize a keyword phrase for matching: cleaned, lowercased, and its last
 * word reduced to its singular base (the word that carries French/English
 * plural agreement in a short phrase).
 */
function keywordBase(cleanedKeyword: string): string {
  const words = cleanedKeyword.split(" ");
  words[words.length - 1] = singularBase(words[words.length - 1]);
  return words.join(" ");
}

/**
 * Check if a comment or story-reply text matches any of the given keywords.
 * Matching is case- and accent-insensitive, and tolerates singular/plural on
 * both sides.
 *
 * @param commentText - The raw text to check
 * @param keywords - Array of keywords to match against
 * @param wholeWordMatch - If true, keyword must be a standalone word.
 *                         If false, partial matches are allowed (e.g. "linking" matches "link")
 * @returns Match result with the first matched keyword (if any)
 */
export function matchKeywords(
  commentText: string,
  keywords: string[],
  wholeWordMatch: boolean = true
): KeywordMatchResult {
  if (!commentText || keywords.length === 0) {
    return { matched: false, matchedKeyword: null };
  }

  const cleanedText = stripSpecialCharacters(commentText).toLowerCase();

  if (!cleanedText) {
    return { matched: false, matchedKeyword: null };
  }

  for (const keyword of keywords) {
    const cleanedKeyword = stripSpecialCharacters(keyword).toLowerCase();

    if (!cleanedKeyword) continue;

    if (wholeWordMatch) {
      // Every word of the phrase tolerates singular/plural on both sides
      // (French agreement hits every word: « cartes cadeaux » ↔ "carte cadeau").
      const pattern = cleanedKeyword
        .split(" ")
        .map((word) => {
          const escaped = singularBase(word).replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          return `${escaped}(?:s|x)?`;
        })
        .join(" ");
      const regex = new RegExp(`\\b${pattern}\\b`, "i");
      if (regex.test(cleanedText)) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      // Partial match — the last word's base as substring also covers its
      // plural; earlier words of a phrase must appear as written.
      if (cleanedText.includes(keywordBase(cleanedKeyword))) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}
