/**
 * Keyword Matcher — Unit Tests
 *
 * Tests all edge cases for keyword matching logic.
 */

import { describe, it, expect } from "vitest";
import {
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

describe("matchKeywords — accent insensitivity (French)", () => {
  it("should match an accented keyword against unaccented text", () => {
    expect(matchKeywords("je veux la priere", ["prière"], true).matched).toBe(true);
  });

  it("should match an unaccented keyword against accented text", () => {
    expect(matchKeywords("la PRIÈRE svp", ["priere"], true).matched).toBe(true);
  });

  it("should match accents + case combined", () => {
    expect(matchKeywords("MAISON", ["maïson"], true).matched).toBe(true);
    expect(matchKeywords("Bénédiction reçue", ["benediction"], true).matched).toBe(true);
  });

  it("should fold cedilla and circumflex", () => {
    expect(matchKeywords("un garcon", ["garçon"], true).matched).toBe(true);
    expect(matchKeywords("la fête", ["fete"], true).matched).toBe(true);
  });
});

describe("matchKeywords — singular/plural tolerance", () => {
  it("should match a plural text with a singular keyword", () => {
    expect(matchKeywords("je veux les MAISONS", ["maison"], true).matched).toBe(true);
  });

  it("should match a singular text with a plural keyword", () => {
    expect(matchKeywords("la maison", ["maisons"], true).matched).toBe(true);
  });

  it("should handle -x plurals both ways", () => {
    expect(matchKeywords("tous mes voeux", ["voeu"], true).matched).toBe(true);
    expect(matchKeywords("un voeu", ["voeux"], true).matched).toBe(true);
  });

  it("should still match words that naturally end in s", () => {
    expect(matchKeywords("le paradis", ["paradis"], true).matched).toBe(true);
  });

  it("should not strip short keywords into loose matches", () => {
    // "os" must not become "o" and match anything.
    expect(matchKeywords("o la la", ["os"], true).matched).toBe(false);
    expect(matchKeywords("un os", ["os"], true).matched).toBe(true);
  });

  it("should apply plural tolerance to every word of a phrase (whole-word)", () => {
    expect(matchKeywords("mes cartes cadeaux", ["carte cadeau"], true).matched).toBe(true);
    expect(matchKeywords("ma carte cadeau", ["cartes cadeaux"], true).matched).toBe(true);
  });
});

describe("city keywords — campagne première (toutes graphies)", () => {
  const cities = [
    "Paris", "Saint-Étienne", "Aix-en-Provence", "Besançon", "Nîmes",
    "Clermont-Ferrand", "Nouméa", "Genève", "Liège", "Le Havre",
    "Pointe-à-Pitre", "Fort-de-France", "Mâcon", "Épinal", "Angoulême",
  ];

  const variants: Array<[string, string]> = [
    ["paris", "Paris"],
    ["PARIS", "Paris"],
    ["Paris !!", "Paris"],
    ["je viens de saint-étienne", "Saint-Étienne"],
    ["SAINT ETIENNE", "Saint-Étienne"],
    ["saint etienne ❤️", "Saint-Étienne"],
    ["aix en provence", "Aix-en-Provence"],
    ["AIX-EN-PROVENCE", "Aix-en-Provence"],
    ["besancon", "Besançon"],
    ["BESANÇON", "Besançon"],
    ["nimes", "Nîmes"],
    ["clermont ferrand", "Clermont-Ferrand"],
    ["CLERMONT-FERRAND", "Clermont-Ferrand"],
    ["noumea", "Nouméa"],
    ["geneve", "Genève"],
    ["GENÈVE 🙏", "Genève"],
    ["liege", "Liège"],
    ["le havre", "Le Havre"],
    ["LE HAVRE", "Le Havre"],
    ["pointe a pitre", "Pointe-à-Pitre"],
    ["fort de france", "Fort-de-France"],
    ["macon", "Mâcon"],
    ["epinal", "Épinal"],
    ["angouleme", "Angoulême"],
  ];

  it.each(variants)(
    "déclenche pour « %s » (ville attendue : %s)",
    (text, expected) => {
      const result = matchKeywords(text, cities, true);
      expect(result.matched).toBe(true);
      expect(result.matchedKeyword).toBe(expected);
    }
  );

  it("déclenche aussi au milieu d'une phrase", () => {
    expect(
      matchKeywords("moi je serais chaud pour paris ou lyon", ["Paris"], true)
        .matched
    ).toBe(true);
  });

  it("ne déclenche pas pour une ville absente de la liste", () => {
    expect(matchKeywords("montréal", cities, true).matched).toBe(false);
  });
});
