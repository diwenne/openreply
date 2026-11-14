import { createHmac } from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  getAuthorizationUrl,
  verifyOAuthState,
} from "../lib/meta/oauth";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

describe("OAuth state and token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const encrypted = encryptToken("long-lived-token");
    expect(encrypted).not.toBe("long-lived-token");
    expect(decryptToken(encrypted)).toBe("long-lived-token");
  });

  it("signs and verifies Instagram OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(state)?.workspaceId).toBe("workspace_123");
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });

  // Builds a state whose signature is valid but whose payload has an
  // unusual shape, so verifyOAuthState is exercised on its own validation
  // rather than on the signature check.
  const signedState = (payload: Record<string, unknown>) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", process.env.NEXTAUTH_SECRET!)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  };

  it("rejects a state with no timestamp", () => {
    expect(verifyOAuthState(signedState({ workspaceId: "workspace_123" }))).toBeNull();
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: "workspace_123", ts: "not-a-number" })
      )
    ).toBeNull();
  });

  it("rejects a timestamp in the future", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() + 60 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects an expired timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() - 11 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects a state whose workspaceId is not a string", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: 123, ts: Date.now() })
      )
    ).toBeNull();
  });
});

describe("authorization URL", () => {
  it("uses Instagram Login when no login configuration is set", () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "123");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "s"));
    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("scope")).toContain("instagram_business_basic");
  });

  it("uses the Facebook dialog with config_id under Unified login", () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "123");
    vi.stubEnv("META_APP_ID", "789");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "456");
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "s"));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/dialog/oauth");
    expect(url.searchParams.get("config_id")).toBe("456");
    // The Meta app's own ID, not the Instagram app ID.
    expect(url.searchParams.get("client_id")).toBe("789");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});
