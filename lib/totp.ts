/**
 * TOTP second factor
 *
 * A magic link proves control of the mailbox; TOTP proves possession of the
 * enrolled device. The verified state is a cookie whose value is an HMAC of
 * the CURRENT session token (keyed with NEXTAUTH_SECRET): the proof is bound
 * to one session — a stolen proof cookie is useless with any other session,
 * and every new session must verify again.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { generateSecret, generateURI, verifySync } from "otplib";

const TOTP_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-openreply-totp"
    : "openreply-totp";

const SESSION_COOKIES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

// Matches the Auth.js session lifetime (30 days) — the proof never outlives
// the session it is bound to, because the HMAC input dies with the session.
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function secretKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for TOTP proofs");
  return secret;
}

async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  for (const name of SESSION_COOKIES) {
    const value = jar.get(name)?.value;
    if (value) return value;
  }
  return null;
}

function signSessionToken(sessionToken: string): string {
  return createHmac("sha256", secretKey())
    .update(`totp:${sessionToken}`)
    .digest("hex");
}

/** Whether the current request carries a TOTP proof bound to its session. */
export async function isTotpSatisfied(): Promise<boolean> {
  const jar = await cookies();
  const proof = jar.get(TOTP_COOKIE)?.value;
  const sessionToken = await currentSessionToken();
  if (!proof || !sessionToken) return false;

  const expected = signSessionToken(sessionToken);
  try {
    return timingSafeEqual(Buffer.from(proof), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Issue the proof cookie for the current session (after a correct code). */
export async function grantTotpProof(): Promise<void> {
  const sessionToken = await currentSessionToken();
  if (!sessionToken) throw new Error("No session to bind the TOTP proof to");

  const jar = await cookies();
  jar.set(TOTP_COOKIE, signSessionToken(sessionToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildOtpauthUri(accountEmail: string, secret: string): string {
  return generateURI({ issuer: "OpenReply", label: accountEmail, secret });
}

export function verifyTotpCode(code: string, secret: string): boolean {
  try {
    // 30 seconds of tolerance absorbs one time step of clock drift.
    return verifySync({
      secret,
      token: code.replace(/\s+/g, ""),
      epochTolerance: 30,
    }).valid;
  } catch {
    // otplib v13 THROWS on malformed tokens (wrong length, non-digits) —
    // e.g. a backup code entered in the TOTP field. Malformed = invalid.
    return false;
  }
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
