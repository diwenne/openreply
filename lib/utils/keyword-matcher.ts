/**
 * Keyword Matcher
 *
 * Matches comment text against a set of keywords with support for:
 * - Case-insensitive matching
 * - Whole-word or partial matching
 * - Multi-keyword OR logic (any match = true)
 * - Emoji and special character stripping
 *
 * Unicode note: the original implementation used ASCII `\w` and `\b`, which
 * treat every Cyrillic / CJK / accented letter as a "special character" and a
 * non-word char. That silently deleted all non-Latin comment text before
 * matching, so a Russian keyword like "Клод" could never match. Everything
 * here uses Unicode property escapes (`\p{L}` letters, `\p{N}` numbers) with the
 * `u` flag so non-Latin scripts work.
 *
 * Diacritics note: `\p{L}` keeps accented letters intact, which is correct, but
 * it means "PREÇO" and "preco" stay different strings and never match each
 * other. Commenters type accents inconsistently and keyboards differ, so a
 * Portuguese or Spanish campaign keyed on "preco" silently misses every
 * commenter who typed "preço", and vice versa. `foldDiacritics` closes that
 * gap on BOTH sides of the comparison.
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

/**
 * Strip emojis and special characters from text, keeping only
 * letters (any script), numbers, and whitespace.
 */
export function stripSpecialCharacters(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    )
    // Keep letters (any script) and numbers; turn everything else into a space.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove diacritics from Latin-script text, leaving every other script byte
 * for byte identical.
 *
 * The scoping is the whole point and is not caution for its own sake. The
 * usual one-liner, `text.normalize("NFD").replace(/\p{M}/gu, "")`, is wrong
 * for a multi-script inbox because a combining mark is load bearing outside
 * Latin: it deletes Devanagari vowel signs ("किताब" becomes "कतब"), strips
 * Thai and Arabic vowel marks, folds Cyrillic "й" to "и" and Ukrainian "ї" to
 * "і", and turns the Japanese dakuten in "ガード" into "カート", which is a
 * different word. Only Latin marks are dropped here.
 *
 * Input is decomposed first so the function behaves the same whether the
 * source text arrived precomposed (U+00E9) or decomposed (U+0065 U+0301);
 * Instagram returns both.
 */
export function foldDiacritics(text: string): string {
  let out = "";
  let baseIsLatin = false;

  for (const char of text.normalize("NFD")) {
    if (/\p{M}/u.test(char)) {
      // A mark inherits the script of the base character before it, so the
      // base is what decides whether this mark is dropped or kept.
      if (!baseIsLatin) out += char;
      continue;
    }
    baseIsLatin = /\p{Script=Latin}/u.test(char);
    out += char;
  }

  return out.normalize("NFC");
}

/**
 * Check if a comment text matches any of the given keywords.
 *
 * Both sides are stripped of special characters and folded for Latin
 * diacritics before comparison, so "PREÇO" matches a "preco" keyword and a
 * "preço" keyword matches a "PRECO" comment.
 *
 * @param commentText - The raw comment text to check
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

  const cleanedText = foldDiacritics(
    stripSpecialCharacters(commentText)
  ).toLowerCase();

  if (!cleanedText) {
    return { matched: false, matchedKeyword: null };
  }

  for (const keyword of keywords) {
    const cleanedKeyword = foldDiacritics(
      stripSpecialCharacters(keyword)
    ).toLowerCase();

    if (!cleanedKeyword) continue;

    if (wholeWordMatch) {
      const escapedKeyword = cleanedKeyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      // Unicode-aware "whole word": the keyword must not be flanked by another
      // letter or number. Lookarounds replace ASCII `\b`, which never fires
      // between two non-Latin characters.
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapedKeyword}(?![\\p{L}\\p{N}])`,
        "iu"
      );
      if (regex.test(cleanedText)) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      if (cleanedText.includes(cleanedKeyword)) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}
