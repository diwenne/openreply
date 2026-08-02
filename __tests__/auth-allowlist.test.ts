import { describe, expect, it } from "vitest";
import {
  isAuthDomainAllowed,
  isAuthEmailAllowed,
  isAuthSignInAllowed,
  parseAuthDomainAllowlist,
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

describe("authentication domain allowlist", () => {
  it("normalizes domains and strips leading @", () => {
    expect(parseAuthDomainAllowlist(" @Yoyaku.FR, interwave.live ")).toEqual(
      new Set(["yoyaku.fr", "interwave.live"])
    );
  });

  it("preserves public signup when no domain list is configured", () => {
    expect(isAuthDomainAllowed("person@example.com")).toBe(true);
    expect(isAuthDomainAllowed(null, "")).toBe(true);
  });

  it("allows configured domains case-insensitively", () => {
    expect(isAuthDomainAllowed("Ben@YOYAKU.fr", "yoyaku.fr,interwave.live")).toBe(
      true
    );
    expect(
      isAuthDomainAllowed("tracy@interwave.live", "yoyaku.fr,interwave.live")
    ).toBe(true);
  });

  it("rejects other domains, subdomains, and malformed emails", () => {
    expect(isAuthDomainAllowed("someone@gmail.com", "yoyaku.fr")).toBe(false);
    expect(isAuthDomainAllowed("someone@mail.yoyaku.fr", "yoyaku.fr")).toBe(false);
    expect(isAuthDomainAllowed("not-an-email", "yoyaku.fr")).toBe(false);
    expect(isAuthDomainAllowed(null, "yoyaku.fr")).toBe(false);
  });

  it("fails closed on a whitespace-only configured value", () => {
    expect(isAuthDomainAllowed("ben@yoyaku.fr", " , ")).toBe(false);
  });
});

describe("combined sign-in gate", () => {
  it("keeps public signup with neither list configured", () => {
    expect(isAuthSignInAllowed("anyone@anywhere.com")).toBe(true);
    expect(isAuthSignInAllowed("anyone@anywhere.com", "", "")).toBe(true);
  });

  it("grants access on a domain match alone", () => {
    expect(
      isAuthSignInAllowed("nizar@yoyaku.fr", "b@yoyaku.fr", "yoyaku.fr,interwave.live")
    ).toBe(true);
  });

  it("grants access on an explicit address even outside allowed domains", () => {
    expect(
      isAuthSignInAllowed("freelance@gmail.com", "freelance@gmail.com", "yoyaku.fr")
    ).toBe(true);
  });

  it("rejects when neither list matches", () => {
    expect(
      isAuthSignInAllowed("stranger@gmail.com", "b@yoyaku.fr", "yoyaku.fr")
    ).toBe(false);
  });

  it("keeps the email-only configuration backward compatible", () => {
    expect(isAuthSignInAllowed("b@yoyaku.fr", "b@yoyaku.fr")).toBe(true);
    expect(isAuthSignInAllowed("x@yoyaku.fr", "b@yoyaku.fr")).toBe(false);
  });

  it("rejects a missing email once any list is configured", () => {
    expect(isAuthSignInAllowed(null, "b@yoyaku.fr", "yoyaku.fr")).toBe(false);
  });
});
