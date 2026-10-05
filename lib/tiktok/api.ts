/**
 * TikTok API for Business client (Accounts API).
 *
 * Comments live on business-api.tiktok.com, not on the developers.tiktok.com
 * Login Kit, which has no comment scopes. A few things differ from Meta:
 *
 * - Auth is an `Access-Token` header, not `Authorization: Bearer`.
 * - Every response is HTTP 200 with `{ code, message, request_id, data }`, and
 *   `code !== 0` is a failure. Always check the code.
 * - Comment and video ids are 19-digit snowflakes. Where TikTok sends them as
 *   JSON numbers, a plain JSON.parse silently rounds them and every later call
 *   targets a comment that does not exist. parseTikTokJson quotes them first.
 */

import { getTikTokRedirectUri, requireEnv } from "@/lib/env";

const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const REQUEST_TIMEOUT_MS = 15_000;

// Asking for a scope the app is not approved for makes TikTok refuse the whole
// authorization, so this list has to match what is ticked on the developer app.
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "video.list",
  "comment.list",
  "comment.list.manage",
] as const;

// The consent screen lets the account owner untick scopes, so the callback
// checks the granted list for these two before saving the connection.
export const TIKTOK_REQUIRED_SCOPES = ["comment.list", "comment.list.manage"];

/** TikTok answered with a non-zero `code`: the request was received and rejected. */
export class TikTokApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "TikTokApiError";
  }

  get isRateLimited(): boolean {
    return [40016, 40100, 40133].includes(this.code);
  }

  get isTokenExpired(): boolean {
    return [40102, 40104, 40105].includes(this.code);
  }

  /** Needs the account owner (or the app developer) to fix permissions. */
  get needsReauthorization(): boolean {
    return [40001, 40103, 40107, 40125].includes(this.code);
  }

  get isNotFound(): boolean {
    return this.code === 40007;
  }

  /** 5xxxx: TikTok-side failure, so a write may or may not have happened. */
  get isServerError(): boolean {
    return this.code >= 50000;
  }
}

/** No TikTok envelope came back: network error, timeout, or a non-JSON body. */
export class TikTokTransportError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TikTokTransportError";
  }
}

const BIG_ID_FIELDS =
  /(?<!\\)"(comment_id|video_id|parent_comment_id|item_id)"\s*:\s*(-?\d+)/g;

/**
 * JSON.parse that keeps TikTok's snowflake ids exact by quoting them before
 * parsing. Only the known id keys are touched, and an escaped key inside a
 * string value (\"comment_id\") never matches.
 */
export function parseTikTokJson<T = unknown>(text: string): T {
  return JSON.parse(text.replace(BIG_ID_FIELDS, '"$1":"$2"')) as T;
}

/** TikTok sends 0 (or "0") for "no parent" on top-level comments. */
export function normalizeParentCommentId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id === "" || id === "0" ? null : id;
}

interface Envelope<T> {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
}

async function call<T>(
  path: string,
  {
    method = "GET",
    accessToken,
    query,
    body,
  }: {
    method?: "GET" | "POST";
    accessToken?: string;
    query?: Record<string, string | number | boolean | string[] | undefined>;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    // Array params are JSON-encoded in the query string, e.g. fields=["item_id"].
    url.searchParams.set(
      key,
      Array.isArray(value) ? JSON.stringify(value) : String(value)
    );
  }

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(accessToken ? { "Access-Token": accessToken } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    throw new TikTokTransportError(
      `TikTok ${path} request failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }

  let envelope: Envelope<T>;
  try {
    envelope = parseTikTokJson<Envelope<T>>(text);
  } catch {
    throw new TikTokTransportError(
      `TikTok ${path} returned HTTP ${response.status} without a JSON body`,
      response.status
    );
  }

  if (typeof envelope.code !== "number") {
    throw new TikTokTransportError(
      `TikTok ${path} returned HTTP ${response.status} without a result code`,
      response.status
    );
  }
  if (envelope.code !== 0) {
    throw new TikTokApiError(
      envelope.code,
      envelope.message || `TikTok ${path} failed`,
      envelope.request_id
    );
  }
  return (envelope.data ?? {}) as T;
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

export function getTikTokAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: requireEnv("TIKTOK_APP_ID"),
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: getTikTokRedirectUri(),
    state,
    // Always show the consent screen, so a reconnect can re-grant scopes.
    disable_auto_auth: "1",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scope: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

function toTokens(data: TokenResponse): TikTokTokens {
  if (!data.access_token || !data.refresh_token || !data.open_id) {
    throw new TikTokTransportError("TikTok token response is missing fields");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    scope: data.scope ?? "",
    expiresIn: data.expires_in ?? 86_400,
    refreshExpiresIn: data.refresh_token_expires_in ?? 31_536_000,
  };
}

/** The auth code is single use and valid for 10 minutes. */
export async function exchangeTikTokCode(code: string): Promise<TikTokTokens> {
  const data = await call<TokenResponse>("tt_user/oauth2/token/", {
    method: "POST",
    body: {
      client_id: requireEnv("TIKTOK_APP_ID"),
      client_secret: requireEnv("TIKTOK_APP_SECRET"),
      grant_type: "authorization_code",
      auth_code: code,
      redirect_uri: getTikTokRedirectUri(),
    },
  });
  return toTokens(data);
}

export async function refreshTikTokTokens(
  refreshToken: string
): Promise<TikTokTokens> {
  const data = await call<TokenResponse>("tt_user/oauth2/refresh_token/", {
    method: "POST",
    body: {
      client_id: requireEnv("TIKTOK_APP_ID"),
      client_secret: requireEnv("TIKTOK_APP_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  return toTokens(data);
}

export function hasRequiredTikTokScopes(scope: string): boolean {
  const granted = new Set(scope.split(/[\s,]+/).filter(Boolean));
  return TIKTOK_REQUIRED_SCOPES.every((name) => granted.has(name));
}

export async function getTikTokProfile(
  accessToken: string,
  openId: string
): Promise<{ username: string | null; displayName: string | null }> {
  const data = await call<{ username?: string; display_name?: string }>(
    "business/get/",
    {
      accessToken,
      query: { business_id: openId, fields: ["username", "display_name"] },
    }
  );
  return {
    username: data.username || null,
    displayName: data.display_name || null,
  };
}

// ─── Videos and comments ────────────────────────────────────────────────────

export interface TikTokVideo {
  id: string;
  caption: string;
  thumbnailUrl: string | null;
  shareUrl: string | null;
  createTime: number | null;
}

interface RawVideo {
  item_id?: string;
  caption?: string;
  thumbnail_url?: string;
  share_url?: string;
  create_time?: string | number;
}

// The v1.3 docs name the path `business/video/list/`, while working clients
// call `business/videos/list/`. Try the documented one and remember whichever
// answers.
const VIDEO_LIST_PATHS = ["business/video/list/", "business/videos/list/"];
let videoListPath: string | null = null;

export async function listTikTokVideos(
  accessToken: string,
  openId: string,
  { maxCount = 20, cursor }: { maxCount?: number; cursor?: number } = {}
): Promise<{ videos: TikTokVideo[]; cursor: number | null; hasMore: boolean }> {
  const query = {
    business_id: openId,
    // Without fields TikTok returns nothing but item_id.
    fields: ["item_id", "caption", "thumbnail_url", "share_url", "create_time"],
    max_count: Math.min(maxCount, 20),
    cursor,
  };

  let data: { videos?: RawVideo[]; cursor?: number; has_more?: boolean } = {};
  for (const path of videoListPath ? [videoListPath] : VIDEO_LIST_PATHS) {
    try {
      data = await call(path, { accessToken, query });
      videoListPath = path;
      break;
    } catch (error) {
      const wrongPath =
        (error instanceof TikTokApiError && error.code === 40008) ||
        (error instanceof TikTokTransportError && error.status === 404);
      if (!wrongPath || path === VIDEO_LIST_PATHS.at(-1) || videoListPath) {
        throw error;
      }
    }
  }

  return {
    videos: (data.videos ?? [])
      .filter((video): video is RawVideo & { item_id: string } =>
        Boolean(video.item_id)
      )
      .map((video) => ({
        id: String(video.item_id),
        caption: video.caption ?? "",
        thumbnailUrl: video.thumbnail_url ?? null,
        shareUrl: video.share_url ?? null,
        createTime:
          video.create_time !== undefined ? Number(video.create_time) : null,
      })),
    cursor: typeof data.cursor === "number" ? data.cursor : null,
    hasMore: Boolean(data.has_more),
  };
}

export interface TikTokComment {
  commentId: string;
  videoId: string;
  parentCommentId: string | null;
  text: string;
  /** True when the account that owns the video wrote it. The only self flag. */
  owner: boolean;
  username: string | null;
  /** Epoch seconds. */
  createTime: number;
  status: string | null;
}

interface RawComment {
  comment_id?: string;
  video_id?: string;
  parent_comment_id?: string | number;
  text?: string;
  owner?: boolean;
  username?: string;
  create_time?: string | number;
  status?: string;
}

function toComment(raw: RawComment, videoId: string): TikTokComment | null {
  if (!raw.comment_id) return null;
  return {
    commentId: String(raw.comment_id),
    videoId: raw.video_id ? String(raw.video_id) : videoId,
    parentCommentId: normalizeParentCommentId(raw.parent_comment_id),
    text: raw.text ?? "",
    owner: raw.owner === true,
    username: raw.username || null,
    createTime: Number(raw.create_time ?? 0),
    status: raw.status ?? null,
  };
}

/**
 * Newest top-level comments on one video (one page, at most 30). Replies are
 * not included; the automation only answers top-level comments.
 */
export async function listTikTokComments(
  accessToken: string,
  openId: string,
  videoId: string,
  {
    maxCount = 30,
    commentIds,
    status = "PUBLIC",
  }: { maxCount?: number; commentIds?: string[]; status?: "PUBLIC" | "ALL" } = {}
): Promise<TikTokComment[]> {
  const data = await call<{ comments?: RawComment[] }>("business/comment/list/", {
    accessToken,
    query: {
      business_id: openId,
      video_id: videoId,
      comment_ids: commentIds,
      status,
      sort_field: "create_time",
      // The docs table calls this sort_order; SDKs send sort_type. Send both.
      sort_order: "desc",
      sort_type: "desc",
      max_count: Math.min(maxCount, 30),
    },
  });
  return (data.comments ?? [])
    .map((raw) => toComment(raw, videoId))
    .filter((comment): comment is TikTokComment => comment !== null);
}

/** One comment by id, or null when TikTok no longer returns it. */
export async function getTikTokComment(
  accessToken: string,
  openId: string,
  videoId: string,
  commentId: string
): Promise<TikTokComment | null> {
  const comments = await listTikTokComments(accessToken, openId, videoId, {
    commentIds: [commentId],
    maxCount: 1,
    status: "ALL",
  });
  return comments.find((comment) => comment.commentId === commentId) ?? null;
}

/**
 * Post a public reply. NOT idempotent: TikTok takes no idempotency key, so a
 * retry after a lost response posts a second visible reply. Callers must claim
 * the comment first and never retry blindly.
 */
export async function replyToTikTokComment(
  accessToken: string,
  openId: string,
  { videoId, commentId, text }: { videoId: string; commentId: string; text: string }
): Promise<{ replyCommentId: string | null }> {
  const data = await call<{ comment_id?: string }>(
    "business/comment/reply/create/",
    {
      method: "POST",
      accessToken,
      body: {
        business_id: openId,
        video_id: videoId,
        comment_id: commentId,
        text,
      },
    }
  );
  return { replyCommentId: data.comment_id ? String(data.comment_id) : null };
}

/**
 * Point the app's COMMENT webhook at this instance. Per developer app, not per
 * account, and authenticated with the app secret.
 *
 * Never sends `item_list`: once any item list is set, TikTok keeps adding to
 * it and the subscription stops covering every video.
 */
export async function subscribeTikTokCommentWebhook(
  callbackUrl: string
): Promise<void> {
  await call("business/webhook/update/", {
    method: "POST",
    body: {
      app_id: requireEnv("TIKTOK_APP_ID"),
      secret: requireEnv("TIKTOK_APP_SECRET"),
      event_type: "COMMENT",
      callback_url: callbackUrl,
    },
  });
}
