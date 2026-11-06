/**
 * Keyword Matcher — Arabic-script (Persian / Arabic / Urdu) coverage.
 *
 * Every case below returned `matched: false` before normalizeArabicScript
 * existed, which made keyword campaigns unusable for a Persian-speaking
 * account: the comment and the keyword look identical on screen and differ
 * only by codepoint.
 */

import { describe, it, expect } from "vitest";
import {
  matchKeywords,
  normalizeArabicScript,
  stripSpecialCharacters,
} from "../lib/utils/keyword-matcher";

const matches = (comment: string, keyword: string, wholeWord = true) =>
  matchKeywords(comment, [keyword], wholeWord).matched;

describe("normalizeArabicScript", () => {
  it("folds Arabic yeh and kaf onto their Persian forms", () => {
    // U+064A + U+0643 in, U+06CC + U+06A9 out.
    expect(normalizeArabicScript("لينك")).toBe("لینک");
  });

  it("folds alef variants and teh marbuta", () => {
    expect(normalizeArabicScript("آإأ")).toBe("ااا");
    expect(normalizeArabicScript("هدية")).toBe("هدیه");
  });

  it("drops harakat, tatweel and ZWNJ", () => {
    expect(normalizeArabicScript("لِینک")).toBe("لینک");
    expect(normalizeArabicScript("لیــنک")).toBe("لینک");
    expect(normalizeArabicScript("قیمت‌ها")).toBe("قیمتها");
  });

  it("converts Persian and Arabic-Indic digits to ASCII", () => {
    expect(normalizeArabicScript("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeArabicScript("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("leaves Latin and other scripts untouched", () => {
    expect(normalizeArabicScript("Клод link 链接")).toBe("Клод link 链接");
  });
});

describe("matchKeywords — Persian comments", () => {
  it("matches a Persian keyword against an Arabic-keyboard comment", () => {
    expect(matches("لينك بده لطفا", "لینک")).toBe(true);
  });

  it("matches in the other direction too", () => {
    expect(matches("لینک بده لطفا", "لينك")).toBe(true);
  });

  it("matches across the ZWNJ spelling split", () => {
    expect(matches("قیمت‌ها چنده؟", "قیمتها")).toBe(true);
    expect(matches("قیمتها چنده؟", "قیمت‌ها")).toBe(true);
  });

  it("matches Persian digits against an ASCII-digit keyword", () => {
    expect(matches("کد۵ رو میخوام", "کد5")).toBe(true);
  });

  it("matches through kashida stretching and harakat", () => {
    expect(matches("لیــنک", "لینک")).toBe(true);
    expect(matches("لِینک", "لینک")).toBe(true);
  });

  it("still respects whole-word boundaries in Persian", () => {
    expect(matches("لینکدونی", "لینک", true)).toBe(false);
    expect(matches("لینکدونی", "لینک", false)).toBe(true);
  });

  it("does not match an unrelated Persian word", () => {
    expect(matches("سلام خوبی", "لینک")).toBe(false);
  });

  it("strips Persian punctuation around the keyword", () => {
    expect(matches("سلام، لینک؟", "لینک")).toBe(true);
  });
});

describe("stripSpecialCharacters — combining marks survive", () => {
  it("keeps a decomposed Latin diacritic joined to its base", () => {
    // Was "sen or" before \p{M} was added to the keep-set.
    expect(stripSpecialCharacters("señor".normalize("NFD"))).toBe(
      "señor".normalize("NFD")
    );
  });

  it("keeps Devanagari vowel signs", () => {
    // Built by codepoint on purpose: an editor bidi-reorders this string,
    // so a second hand-typed copy silently drifts by a character.
    const kitab = "\u0915\u093f\u0924\u093e\u092c"; // kitab
    expect(stripSpecialCharacters(kitab)).toBe(kitab);
  });

  it("matches a decomposed accented comment against a plain keyword", () => {
    expect(matches("señor".normalize("NFD"), "senor")).toBe(true);
    expect(matches("preço".normalize("NFD"), "preco")).toBe(true);
  });
});
