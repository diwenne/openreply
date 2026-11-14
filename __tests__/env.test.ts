import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getEncryptionKeyHex,
  getMetaGraphApiVersion,
  getMissingInstagramOAuthEnv,
  isEmailAllowedToSignIn,
  requireEnv,
} from "../lib/env";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("environment helpers", () => {
  it("requires missing variables", () => {
    expect(() => requireEnv("MISSING_TEST_ENV")).toThrow(
      "MISSING_TEST_ENV environment variable is required"
    );
  });

  it("validates the encryption key format", () => {
    vi.stubEnv("ENCRYPTION_KEY", "not-hex");
    expect(() => getEncryptionKeyHex()).toThrow(
      "ENCRYPTION_KEY must be a 32-byte hex string"
    );
  });

  it("defaults Meta Graph API version in one place", () => {
    expect(getMetaGraphApiVersion()).toBe("v25.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
    expect(getMetaGraphApiVersion()).toBe("v26.0");
  });

  it("asks for the variables of the login new connections will use", () => {
    vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
    vi.stubEnv("NEXTAUTH_SECRET", "secret");
    vi.stubEnv("INSTAGRAM_APP_ID", "ig");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "ig-secret");
    vi.stubEnv("META_APP_ID", "");
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    expect(getMissingInstagramOAuthEnv()).toEqual([]);

    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    expect(getMissingInstagramOAuthEnv()).toEqual([
      "META_APP_ID",
      "FACEBOOK_APP_SECRET",
    ]);
  });
});

describe("sign-in allowlist", () => {
  it("allows everyone when ALLOWED_EMAILS is unset", () => {
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
  });

  it("allows everyone when ALLOWED_EMAILS is empty or only separators", () => {
    vi.stubEnv("ALLOWED_EMAILS", "  , ,  ");
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
  });

  it("only allows listed addresses once ALLOWED_EMAILS is set", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com,team@example.com");
    expect(isEmailAllowedToSignIn("owner@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn("team@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn("stranger@example.com")).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    vi.stubEnv("ALLOWED_EMAILS", "  Owner@Example.com , team@example.com ");
    expect(isEmailAllowedToSignIn("OWNER@example.COM")).toBe(true);
  });

  it("rejects a missing address when the list is set", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn(null)).toBe(false);
    expect(isEmailAllowedToSignIn(undefined)).toBe(false);
    expect(isEmailAllowedToSignIn("")).toBe(false);
  });
});
