import { describe, it, expect } from "vitest";
import { parseCsv, instagramShortcode } from "../lib/utils/csv";

describe("parseCsv", () => {
  it("parses a simple file keyed by lowercased headers", () => {
    const rows = parseCsv("post,keywords,dm_message\nabc,LINK,Hello");
    expect(rows).toEqual([
      { post: "abc", keywords: "LINK", dm_message: "Hello" },
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('post,keywords\nabc,"LINK,SHOP,BUY"');
    expect(rows[0].keywords).toBe("LINK,SHOP,BUY");
  });

  it("handles escaped quotes and newlines inside quotes", () => {
    const rows = parseCsv('post,dm_message\nabc,"Say ""hi""\nand bye"');
    expect(rows[0].dm_message).toBe('Say "hi"\nand bye');
  });

  it("skips blank lines and trims cells", () => {
    const rows = parseCsv("post,keywords\n\n  abc  , LINK \n");
    expect(rows).toEqual([{ post: "abc", keywords: "LINK" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("tolerates CRLF line endings", () => {
    const rows = parseCsv("post,keywords\r\nabc,LINK\r\n");
    expect(rows[0]).toEqual({ post: "abc", keywords: "LINK" });
  });
});

describe("instagramShortcode", () => {
  it("extracts the shortcode from reel and post URLs", () => {
    expect(instagramShortcode("https://instagram.com/reel/ABC123")).toBe("ABC123");
    expect(instagramShortcode("https://www.instagram.com/p/xyz_9/")).toBe("xyz_9");
    expect(instagramShortcode("https://instagram.com/reels/QQ-1/?x=1")).toBe("QQ-1");
  });

  it("returns null for non-post values", () => {
    expect(instagramShortcode("12345")).toBeNull();
    expect(instagramShortcode("https://example.com/foo")).toBeNull();
  });
});
