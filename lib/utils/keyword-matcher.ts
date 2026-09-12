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
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

/**
 * A trigger keyword that is purely digits (optionally mixed with the letter
 * "o"/"O", the character it gets confused with) — e.g. "08", "17".
 */
function isNumericLikeKeyword(cleanedKeyword: string): boolean {
  return /^[0-9oO]+$/.test(cleanedKeyword);
}

/**
 * Fold the letter O into the digit 0. Commenters routinely type "O8" for a
 * "08" trigger word — same glyph on most fonts, and mobile autocapitalize
 * turns a leading "o" into "O" on top of that. Confirmed in production: a
 * numeric campaign keyword silently dropped every comment spelled with the
 * letter instead of the digit, with no error anywhere (matchKeywords just
 * returns unmatched, same as any other non-matching comment).
 *
 * Scoped to numeric-like keywords only (see isNumericLikeKeyword) so a real
 * word keyword ("love", "more info") is never affected by this fold.
 */
function foldNumericHomoglyphs(value: string): string {
  return value.replace(/o/gi, "0");
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
 * Check if a comment text matches any of the given keywords.
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

  const cleanedText = stripSpecialCharacters(commentText).toLowerCase();

  if (!cleanedText) {
    return { matched: false, matchedKeyword: null };
  }

  for (const keyword of keywords) {
    const cleanedKeyword = stripSpecialCharacters(keyword).toLowerCase();

    if (!cleanedKeyword) continue;

    // Only numeric-like keywords get the O/0 fold — a word keyword compares
    // exactly as before.
    const numericLike = isNumericLikeKeyword(cleanedKeyword);
    const compareText = numericLike
      ? foldNumericHomoglyphs(cleanedText)
      : cleanedText;
    const compareKeyword = numericLike
      ? foldNumericHomoglyphs(cleanedKeyword)
      : cleanedKeyword;

    if (wholeWordMatch) {
      const escapedKeyword = compareKeyword.replace(
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
      if (regex.test(compareText)) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      if (compareText.includes(compareKeyword)) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}
