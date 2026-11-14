import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import {
  getEncryptionKeyHex,
  getMetaGraphApiVersion,
  isUnifiedLogin,
  requireEnv,
} from "@/lib/env";

// Instagram API with Instagram Login authorizes on www.instagram.com. The old
// api.instagram.com/oauth/authorize host belonged to the retired Basic Display
// API and now 404s ("Sorry, this page isn't available"), which looks like a bad
// link rather than a wrong endpoint. The token exchange below still lives on
// api.instagram.com — only the authorize hop moved.
const INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

interface OAuthStatePayload {
  workspaceId: string;
  ts: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signState(payload: string): string {
  return createHmac("sha256", requireEnv("NEXTAUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

export function createOAuthState(workspaceId: string): string {
  const payload = base64UrlEncode(
    JSON.stringify({ workspaceId, ts: Date.now() } satisfies OAuthStatePayload)
  );
  return `${payload}.${signState(payload)}`;
}

export function verifyOAuthState(state: string | null): OAuthStatePayload | null {
  if (!state) return null;

  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = signState(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as OAuthStatePayload;
    if (typeof parsed.workspaceId !== "string" || !parsed.workspaceId) {
      return null;
    }

    // Reject a missing or non-numeric timestamp. `Date.now() - "abc"` is NaN,
    // and every comparison against NaN is false, so a non-numeric ts would
    // otherwise pass the age check and never expire. A ts in the future is
    // rejected for the same reason: it has not aged at all.
    if (typeof parsed.ts !== "number" || !Number.isFinite(parsed.ts)) {
      return null;
    }

    const age = Date.now() - parsed.ts;
    if (age < 0 || age > STATE_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getAuthorizationUrl(redirectUri: string, state: string): string {
  if (isUnifiedLogin()) {
    // The login configuration carries the permissions and the asset picker,
    // so there is no scope parameter here. prompt=login offers both the
    // Instagram and the Facebook login, even to someone already signed in to
    // Facebook in this browser.
    const params = new URLSearchParams({
      client_id: requireEnv("META_APP_ID"),
      config_id: requireEnv("META_LOGIN_CONFIG_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      prompt: "login",
      state,
    });
    return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    redirect_uri: redirectUri,
    scope:
      "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights",
    response_type: "code",
    state,
  });

  return `${INSTAGRAM_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; userId: string }> {
  if (isUnifiedLogin()) {
    // Returns the final token: a business system user token for the client's
    // portfolio. It names no Instagram account; the callback lists the
    // accounts the client assigned to it.
    const url = new URL(
      `https://graph.facebook.com/${getMetaGraphApiVersion()}/oauth/access_token`
    );
    url.searchParams.set("client_id", requireEnv("META_APP_ID"));
    url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);
    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(
        `Token exchange failed: ${data.error?.message || JSON.stringify(data)}`
      );
    }
    return { accessToken: data.access_token, userId: "" };
  }

  const body = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Token exchange failed: ${error.error_message || JSON.stringify(error)}`
    );
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
  };
}

function getEncryptionKey(): Buffer {
  return Buffer.from(getEncryptionKeyHex(), "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString("base64");
}

export function decryptToken(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
