import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";

const FACEBOOK_OAUTH_BASE = "https://www.facebook.com";
const FACEBOOK_GRAPH_BASE = "https://graph.facebook.com";

function oauthDialogUrl() {
  return `${FACEBOOK_OAUTH_BASE}/${getMetaGraphApiVersion()}/dialog/oauth`;
}

function graphBase() {
  return `${FACEBOOK_GRAPH_BASE}/${getMetaGraphApiVersion()}`;
}

async function throwGraphError(response: Response): Promise<never> {
  const error = await response.json().catch(() => ({}));
  throw new Error(
    `Facebook Graph request failed: ${
      error?.error?.message || JSON.stringify(error)
    }`
  );
}

export function getFacebookAuthorizationUrl(
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });

  // The Meta app uses the "Facebook Login for Business" product, which drives the
  // dialog from a saved Configuration (config_id) instead of a runtime scope list.
  // The config must be a *User access token* type bundling pages_messaging,
  // pages_manage_metadata, pages_read_engagement (see PR description). User-token
  // configs default to the implicit grant, so override_default_response_type=true
  // is required to force the code grant our callback exchanges server-side.
  // Falls back to the classic scope dialog when FACEBOOK_LOGIN_CONFIG_ID is unset.
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID;
  if (configId) {
    params.set("config_id", configId);
    params.set("override_default_response_type", "true");
  } else {
    params.set(
      "scope",
      "pages_messaging,pages_manage_metadata,pages_read_engagement"
    );
  }

  return `${oauthDialogUrl()}?${params.toString()}`;
}

export async function exchangeFacebookCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  if (!response.ok) await throwGraphError(response);

  const data = await response.json();
  return { accessToken: data.access_token };
}

export async function getLongLivedUserToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());
  if (!response.ok) await throwGraphError(response);

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 0,
  };
}

export async function getUserPages(
  userAccessToken: string
): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const url = new URL(`${graphBase()}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userAccessToken);

  const response = await fetch(url.toString());
  if (!response.ok) await throwGraphError(response);

  // ponytail: reads only the first page of /me/accounts. Admins with >25 Pages
  // would need paging.next followed — add when that case shows up.
  const data = await response.json();
  return data.data ?? [];
}
