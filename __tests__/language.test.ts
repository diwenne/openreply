import { afterEach, describe, expect, it, vi } from "vitest";

import { pickLabel, pickLanguage } from "../lib/utils/language";

const IT = "🇮🇹";
const EN = "🇺🇸";

const BILINGUAL = `${IT} Ciao, vuoi scaricare gli sfondi?\n\n${EN} Hi! Are you interested in the wallpapers?`;

/**
 * KEYWORD_LANGUAGES is read once at import time, so the keyword tests reload
 * the module with the environment already in place.
 */
async function loadWithEnv(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env.KEYWORD_LANGUAGES;
  else process.env.KEYWORD_LANGUAGES = value;
  return import("../lib/utils/language");
}

afterEach(() => {
  delete process.env.KEYWORD_LANGUAGES;
  vi.resetModules();
});

describe("languageForKeyword", () => {
  it("maps a configured keyword, case- and space-insensitively", async () => {
    const { languageForKeyword } = await loadWithEnv(
      "sfondi:it, wallpapers:en"
    );
    expect(languageForKeyword("sfondi")).toBe("it");
    expect(languageForKeyword("  WALLPAPERS ")).toBe("en");
  });

  it("returns null for an unmapped keyword or no configuration", async () => {
    const configured = await loadWithEnv("sfondi:it");
    expect(configured.languageForKeyword("hello")).toBeNull();
    expect(configured.languageForKeyword(null)).toBeNull();

    const unset = await loadWithEnv(undefined);
    expect(unset.languageForKeyword("sfondi")).toBeNull();
  });

  it("skips malformed pairs instead of throwing", async () => {
    const { languageForKeyword } = await loadWithEnv(
      "sfondi:it,broken,ciao:klingon,:en"
    );
    expect(languageForKeyword("sfondi")).toBe("it");
    expect(languageForKeyword("ciao")).toBeNull();
  });
});

describe("pickLanguage", () => {
  it("keeps only the requested half and drops the flag", () => {
    expect(pickLanguage(BILINGUAL, "it")).toBe(
      "Ciao, vuoi scaricare gli sfondi?"
    );
    expect(pickLanguage(BILINGUAL, "en")).toBe(
      "Hi! Are you interested in the wallpapers?"
    );
  });

  it("keeps the whole message when no language was matched", () => {
    expect(pickLanguage(BILINGUAL, null)).toBe(BILINGUAL);
  });

  it("keeps the whole message when it is not bilingual", () => {
    const single = `${IT} Solo italiano`;
    expect(pickLanguage(single, "it")).toBe(single);
    expect(pickLanguage("No flags at all", "it")).toBe("No flags at all");
  });

  it("keeps the whole message when the requested language is absent", () => {
    expect(pickLanguage(BILINGUAL, "es")).toBe(BILINGUAL);
  });

  it("re-attaches a trailing {link} to the half that lost it", () => {
    const withLink = `${IT} Ecco gli sfondi\n\n${EN} Here are the wallpapers\n\n{link}`;
    expect(pickLanguage(withLink, "it")).toBe("Ecco gli sfondi\n\n{link}");
    expect(pickLanguage(withLink, "en")).toBe(
      "Here are the wallpapers\n\n{link}"
    );
  });

  it("splits a third language on its own flag", () => {
    const three = `${IT} Italiano\n\n${EN} English\n\n🇪🇸 Español`;
    expect(pickLanguage(three, "en")).toBe("English");
    expect(pickLanguage(three, "es")).toBe("Español");
  });
});

describe("pickLabel", () => {
  it("falls back to the first half so Instagram does not truncate it", () => {
    expect(pickLabel(`${IT} Sì grazie\n${EN} Yes please`, null)).toBe(
      "Sì grazie"
    );
  });

  it("still honours a known language", () => {
    expect(pickLabel(`${IT} Sì grazie\n${EN} Yes please`, "en")).toBe(
      "Yes please"
    );
  });

  it("passes through a single-language label untouched", () => {
    expect(pickLabel("Download Link", "it")).toBe("Download Link");
    expect(pickLabel(null, "it")).toBe("");
  });
});
