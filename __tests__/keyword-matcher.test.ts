/**
 * Keyword Matcher — Unit Tests
 *
 * Tests all edge cases for keyword matching logic.
 */

import { describe, it, expect } from "vitest";
import {
  foldDiacritics,
  matchKeywords,
  stripSpecialCharacters,
} from "../lib/utils/keyword-matcher";

describe("stripSpecialCharacters", () => {
  it("should remove emojis", () => {
    expect(stripSpecialCharacters("Hello 🔥 World 💪")).toBe("Hello World");
  });

  it("should remove special characters but keep alphanumeric", () => {
    expect(stripSpecialCharacters("price!!??")).toBe("price");
  });

  it("should collapse multiple spaces into one", () => {
    expect(stripSpecialCharacters("hello   world")).toBe("hello world");
  });

  it("should handle empty strings", () => {
    expect(stripSpecialCharacters("")).toBe("");
  });

  it("should handle strings with only emojis", () => {
    expect(stripSpecialCharacters("🔥💪😊")).toBe("");
  });

  it("should preserve numbers", () => {
    expect(stripSpecialCharacters("price123")).toBe("price123");
  });

  it("should preserve non-Latin letters (Cyrillic)", () => {
    expect(stripSpecialCharacters("Клод")).toBe("Клод");
  });

  it("should preserve non-Latin letters within punctuation", () => {
    expect(stripSpecialCharacters("Клод!!")).toBe("Клод");
  });

  it("should preserve other scripts (Greek, CJK)", () => {
    expect(stripSpecialCharacters("λόγος")).toBe("λόγος");
    expect(stripSpecialCharacters("链接")).toBe("链接");
  });
});

describe("matchKeywords — whole word matching", () => {
  it("should match exact keyword (case-insensitive)", () => {
    const result = matchKeywords("I want the LINK", ["link"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match keyword regardless of case", () => {
    expect(matchKeywords("give me the Link please", ["LINK"], true).matched).toBe(true);
    expect(matchKeywords("LINK", ["link"], true).matched).toBe(true);
    expect(matchKeywords("liNk", ["LINK"], true).matched).toBe(true);
  });

  it("should NOT match partial words in whole-word mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match when keyword is at the start", () => {
    const result = matchKeywords("LINK please", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match when keyword is at the end", () => {
    const result = matchKeywords("send me the link", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match first keyword in multi-keyword list (OR logic)", () => {
    const result = matchKeywords("I want the price", ["link", "price", "info"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("price");
  });

  it("should return first matching keyword", () => {
    const result = matchKeywords("link and price", ["link", "price"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should not match if no keywords match", () => {
    const result = matchKeywords("hello world", ["link", "price"], true);
    expect(result.matched).toBe(false);
    expect(result.matchedKeyword).toBeNull();
  });
});

describe("matchKeywords — non-Latin scripts", () => {
  it("should match a Cyrillic keyword in whole-word mode", () => {
    const result = matchKeywords("Клод", ["Клод"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("Клод");
  });

  it("should match a Cyrillic keyword inside a sentence", () => {
    expect(matchKeywords("хочу Клод плиз", ["Клод"], true).matched).toBe(true);
  });

  it("should match a Cyrillic keyword surrounded by punctuation/emoji", () => {
    expect(matchKeywords("🔥 Клод! 🔥", ["Клод"], true).matched).toBe(true);
  });

  it("should be case-insensitive for Cyrillic", () => {
    expect(matchKeywords("клод", ["КЛОД"], true).matched).toBe(true);
  });

  it("should NOT match a different Cyrillic word in whole-word mode", () => {
    // "Клодом" is a different word; whole-word must not fire on the stem.
    expect(matchKeywords("Клодом", ["Клод"], true).matched).toBe(false);
  });

  it("should match a Cyrillic stem in partial mode", () => {
    expect(matchKeywords("Клодом", ["Клод"], false).matched).toBe(true);
  });

  it("should match other scripts (CJK)", () => {
    expect(matchKeywords("发我链接", ["链接"], false).matched).toBe(true);
  });
});

describe("matchKeywords — partial matching", () => {
  it("should match partial words in partial mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], false);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match substring anywhere in text", () => {
    const result = matchKeywords("unbreakable bond", ["break"], false);
    expect(result.matched).toBe(true);
  });

  it("should be case-insensitive in partial mode", () => {
    const result = matchKeywords("LINKING", ["link"], false);
    expect(result.matched).toBe(true);
  });
});

describe("matchKeywords — edge cases", () => {
  it("should return false for empty comment text", () => {
    const result = matchKeywords("", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should return false for empty keywords array", () => {
    const result = matchKeywords("give me the link", [], true);
    expect(result.matched).toBe(false);
  });

  it("should handle comments with only emojis", () => {
    const result = matchKeywords("🔥🔥🔥", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match keyword even with surrounding emojis", () => {
    const result = matchKeywords("🔥 LINK 🔥", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle keywords with special characters", () => {
    const result = matchKeywords("send info", ["info!"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle multi-word keywords", () => {
    const result = matchKeywords("I want more info please", ["more info"], true);
    expect(result.matched).toBe(true);
  });
});

describe("foldDiacritics", () => {
  it("should strip accents from Latin text", () => {
    expect(foldDiacritics("preço")).toBe("preco");
    expect(foldDiacritics("ÍNDICE")).toBe("INDICE");
    expect(foldDiacritics("informação")).toBe("informacao");
    expect(foldDiacritics("¿CUÁL?")).toBe("¿CUAL?");
    expect(foldDiacritics("café crème")).toBe("cafe creme");
  });

  it("should treat precomposed and decomposed input identically", () => {
    const precomposed = "\u00E9";
    const decomposed = "e\u0301";
    expect(foldDiacritics(precomposed)).toBe("e");
    expect(foldDiacritics(decomposed)).toBe("e");
  });

  it("should leave non-Latin scripts untouched", () => {
    // A combining mark is load bearing outside Latin, so the usual
    // NFD-then-strip-\p{M} one-liner corrupts these. Folding must not.
    expect(foldDiacritics("йод Клод Україна")).toBe("йод Клод Україна");
    expect(foldDiacritics("Ελλάδα")).toBe("Ελλάδα");
    expect(foldDiacritics("किताब")).toBe("किताब");
    expect(foldDiacritics("สวัสดี")).toBe("สวัสดี");
    expect(foldDiacritics("مَرْحَبًا")).toBe("مَرْحَبًا");
  });

  it("should not flip Japanese dakuten", () => {
    // ガード (guard) would become カート (cart) under an unscoped fold.
    expect(foldDiacritics("ガード")).toBe("ガード");
  });

  it("should leave text with no diacritics unchanged", () => {
    expect(foldDiacritics("link")).toBe("link");
    expect(foldDiacritics("")).toBe("");
  });

  it("should not fold ligatures, which are not diacritics", () => {
    expect(foldDiacritics("Fußball")).toBe("Fußball");
  });
});

describe("matchKeywords — diacritics", () => {
  it("should match an accented comment against an unaccented keyword", () => {
    expect(matchKeywords("PREÇO?", ["preco"], true).matched).toBe(true);
    expect(matchKeywords("ÍNDICE", ["indice"], true).matched).toBe(true);
    expect(matchKeywords("informação", ["informacao"], true).matched).toBe(
      true
    );
  });

  it("should match an unaccented comment against an accented keyword", () => {
    expect(matchKeywords("preco por favor", ["preço"], true).matched).toBe(
      true
    );
    expect(matchKeywords("cual es el precio", ["cuál"], true).matched).toBe(
      true
    );
  });

  it("should report the keyword as the campaign spelled it", () => {
    const result = matchKeywords("Qual o PREÇO?", ["preco"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("preco");
  });

  it("should fold in partial mode too", () => {
    expect(matchKeywords("precos hoje", ["preço"], false).matched).toBe(true);
  });

  it("should still respect whole-word boundaries after folding", () => {
    expect(matchKeywords("apreco isso", ["preco"], true).matched).toBe(false);
    expect(matchKeywords("apreço isso", ["preco"], true).matched).toBe(false);
  });

  it("should keep matching non-Latin keywords", () => {
    expect(matchKeywords("дай Клод", ["клод"], true).matched).toBe(true);
    expect(matchKeywords("ガードください", ["ガード"], false).matched).toBe(true);
  });

  it("should not match across different Cyrillic letters", () => {
    // "йод" and "иод" are different words; an unscoped fold would conflate them.
    expect(matchKeywords("иод", ["йод"], true).matched).toBe(false);
  });
});
