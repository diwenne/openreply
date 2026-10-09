import { describe, expect, it } from "vitest";
import { createI18n, resolveLocale } from "../lib/i18n";
import ptBR from "../lib/i18n/pt-BR.json";
import ru from "../lib/i18n/ru.json";
import zhTW from "../lib/i18n/zh-TW.json";

describe("interface translations", () => {
  it("keeps English as the default for absent or unsupported preferences", () => {
    for (const value of [undefined, null, "", "fr", "zh-CN", "../zh-TW", "pt", "pt-PT", "ru-RU"]) {
      expect(resolveLocale(value)).toBe("en");
    }
    expect(resolveLocale("zh-TW")).toBe("zh-TW");
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("ru")).toBe("ru");
  });

  it("renders both interface languages from the same keys", () => {
    expect(createI18n("en").t("Campaigns")).toBe("Campaigns");
    expect(createI18n("zh-TW").t("Campaigns")).toBe("自動回覆活動");
  });

  it("allows sentence order to differ between languages", () => {
    const values = { count: 2 };
    expect(createI18n("en").t("{count} connected accounts", values)).toBe(
      "2 connected accounts",
    );
    expect(createI18n("zh-TW").t("{count} connected accounts", values)).toBe(
      "已連接 2 個帳號",
    );
  });

  it("preserves interpolation values verbatim, including user content and zero", () => {
    const { t } = createI18n("zh-TW");
    expect(t("Hello, {name}!", { name: "{count} <b>Alex</b> $&" })).toBe(
      "你好，{count} <b>Alex</b> $&！",
    );
    expect(t("{count} campaigns", { count: 0 })).toBe("0 個活動");
  });

  it("translates display labels without changing stored codes or unknown values", () => {
    const codes = ["SENT", "OWNER", "active", "CUSTOM_STATUS"];
    expect(codes.map(createI18n("zh-TW").label)).toEqual([
      "已傳送",
      "擁有者",
      "啟用中",
      "CUSTOM_STATUS",
    ]);
    expect(codes).toEqual(["SENT", "OWNER", "active", "CUSTOM_STATUS"]);
    expect(createI18n("zh-TW").label("toString")).toBe("toString");
    expect(createI18n("zh-TW").label("__proto__")).toBe("__proto__");
  });

  it("has complete, plain-text translations with matching interpolation fields", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const catalog of [zhTW, ptBR, ru]) {
      for (const [source, translation] of Object.entries(catalog)) {
        expect(translation.trim(), source).not.toBe("");
        expect(placeholders(translation), source).toEqual(placeholders(source));
        expect(source, source).not.toMatch(/&(?:[a-z]+|#\d+);/i);
      }
    }
  });

  it("keeps the Brazilian Portuguese catalog on exactly the same keys", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(zhTW).sort());
  });

  it("renders Brazilian Portuguese with interpolation and display labels", () => {
    const { t, label } = createI18n("pt-BR");
    expect(t("Campaigns")).toBe("Campanhas");
    expect(t("Settings")).toBe("Configurações");
    expect(t("{count} connected accounts", { count: 2 })).toBe(
      ptBR["{count} connected accounts"].replace("{count}", "2"),
    );
    expect(t("{count} campaigns", { count: 0 })).toBe(
      ptBR["{count} campaigns"].replace("{count}", "0"),
    );
    expect(["SENT", "OWNER", "active", "CUSTOM_STATUS"].map(label)).toEqual([
      ptBR["Sent"],
      ptBR["Owner"],
      ptBR["Active"],
      "CUSTOM_STATUS",
    ]);
  });

  it("keeps the Russian catalog on exactly the same keys", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(zhTW).sort());
  });

  it("renders Russian with interpolation and display labels", () => {
    const { t, label } = createI18n("ru");
    expect(t("Campaigns")).toBe("Кампании");
    expect(t("Settings")).toBe("Настройки");
    expect(t("{count} campaigns", { count: 3 })).toBe("Кампаний: 3");
    expect(["SENT", "OWNER", "active", "CUSTOM_STATUS"].map(label)).toEqual([
      ru["Sent"],
      ru["Owner"],
      ru["Active"],
      "CUSTOM_STATUS",
    ]);
  });
});
