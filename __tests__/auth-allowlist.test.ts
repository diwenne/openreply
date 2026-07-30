import { describe, expect, it } from "vitest";
import {
  isAuthEmailAllowed,
  parseAuthEmailAllowlist,
} from "@/lib/auth-allowlist";

describe("authentication email allowlist", () => {
  it("preserves public signup when no allowlist is configured", () => {
    expect(isAuthEmailAllowed("person@example.com")).toBe(true);
    expect(isAuthEmailAllowed(null, "")).toBe(true);
  });

  it("normalizes configured addresses", () => {
    expect(
      parseAuthEmailAllowlist(" Owner@Example.com, member@example.com ")
    ).toEqual(new Set(["owner@example.com", "member@example.com"]));
  });

  it("allows configured addresses case-insensitively", () => {
    expect(
      isAuthEmailAllowed(
        "OWNER@example.com",
        "owner@example.com,member@example.com"
      )
    ).toBe(true);
  });

  it("rejects unconfigured and missing addresses", () => {
    expect(
      isAuthEmailAllowed("stranger@example.com", "owner@example.com")
    ).toBe(false);
    expect(isAuthEmailAllowed(null, "owner@example.com")).toBe(false);
  });

  it("fails closed when a configured allowlist contains only separators or whitespace", () => {
    expect(isAuthEmailAllowed("stranger@example.com", "  ")).toBe(false);
    expect(isAuthEmailAllowed("stranger@example.com", " , ")).toBe(false);
  });
});
