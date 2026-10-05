import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";
import { refreshTikTokTokens, TikTokApiError } from "@/lib/tiktok/api";

// Access tokens live for one day. Refresh a little early so a token never
// expires between the check and the call.
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export interface TikTokTokenAccount {
  id: string;
  accessToken: string;
  tokenExpiresAt: Date;
  refreshToken: string;
}

/** Refresh an account's tokens and store both, encrypted. */
export async function refreshTikTokAccount(
  account: TikTokTokenAccount
): Promise<string> {
  try {
    const tokens = await refreshTikTokTokens(decryptToken(account.refreshToken));
    await prisma.tikTokAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(tokens.accessToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        refreshToken: encryptToken(tokens.refreshToken),
        refreshTokenExpiresAt: new Date(
          Date.now() + tokens.refreshExpiresIn * 1000
        ),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
      },
    });
    return tokens.accessToken;
  } catch (error) {
    // Another process (the cron, or a second worker job) may have refreshed
    // first, and if TikTok rotates refresh tokens ours is now stale. Use the
    // stored token when it is newer than the one we started from.
    const current = await prisma.tikTokAccount.findUnique({
      where: { id: account.id },
      select: { accessToken: true, tokenExpiresAt: true },
    });
    if (
      current &&
      current.accessToken !== account.accessToken &&
      current.tokenExpiresAt.getTime() > Date.now() + REFRESH_MARGIN_MS
    ) {
      return decryptToken(current.accessToken);
    }
    throw error;
  }
}

export async function getTikTokAccessToken(
  account: TikTokTokenAccount
): Promise<string> {
  if (account.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
    return refreshTikTokAccount(account);
  }
  return decryptToken(account.accessToken);
}

/**
 * Run a call with a valid token. On an expired-token rejection, refresh once
 * and run it once more. That retry is safe even for a reply: TikTok rejected
 * the first request outright, so nothing was posted.
 */
export async function withTikTokToken<T>(
  account: TikTokTokenAccount,
  run: (accessToken: string) => Promise<T>
): Promise<T> {
  const token = await getTikTokAccessToken(account);
  try {
    return await run(token);
  } catch (error) {
    if (!(error instanceof TikTokApiError) || !error.isTokenExpired) throw error;
    return run(await refreshTikTokAccount(account));
  }
}
