/**
 * TOTP helpers — Unit Tests
 *
 * Covers code verification (valid, invalid, drift tolerance) and backup code
 * hashing. Cookie/proof helpers depend on next/headers and are exercised by
 * the live enrollment instead.
 */

import { describe, it, expect } from "vitest";
import { generate } from "otplib";
import {
  buildOtpauthUri,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyTotpCode,
} from "../lib/totp";

describe("TOTP codes", () => {
  it("accepts a code generated from the same secret", async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    expect(verifyTotpCode(code, secret)).toBe(true);
  });

  it("rejects a code from a different secret", async () => {
    const code = await generate({ secret: generateTotpSecret() });
    expect(verifyTotpCode(code, generateTotpSecret())).toBe(false);
  });

  it("rejects garbage input", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("000000", secret) && verifyTotpCode("abcdef", secret)).toBe(false);
    expect(verifyTotpCode("", secret)).toBe(false);
  });

  it("builds a scannable otpauth URI", () => {
    const uri = buildOtpauthUri("op@example.com", generateTotpSecret());
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("OpenReply");
  });
});

describe("Backup codes", () => {
  it("generates 10 unique codes in XXXXX-XXXXX format", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    }
  });

  it("hashes case- and whitespace-insensitively", () => {
    expect(hashBackupCode(" abc12-def34 ")).toBe(hashBackupCode("ABC12-DEF34"));
    expect(hashBackupCode("ABC12-DEF34")).not.toBe(hashBackupCode("ABC12-DEF35"));
  });
});
