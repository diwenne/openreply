export interface MessageTrackedLink {
  slug: string;
  destinationUrl: string;
}

/**
 * Attribution token accepted by the destination site (links.maisondeplume.com
 * whitelists `^[a-z0-9-]{1,24}$` server-side before storing `avant-premiere:<src>`).
 * Kept identical here so a value we emit is never silently dropped downstream.
 */
export const TRACKING_SRC_PATTERN = /^[a-z0-9-]{1,24}$/;
export const TRACKING_SRC_MAX_LENGTH = 24;

export function isValidTrackingSrc(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && TRACKING_SRC_PATTERN.test(value);
}

/**
 * Build the per-post attribution token from an Instagram media id: `ig` + the
 * id, lowercased, with anything outside [a-z0-9-] stripped.
 *
 * Instagram media ids are 17-18 digits today, so `ig` + id is 19-20 characters
 * — comfortably inside the 24-character whitelist. Should Meta ever widen the
 * id, we truncate to 24 rather than drop the token: partial attribution beats
 * none, and a collision would require two ids sharing their first 22 digits
 * (media ids share a leading account-scoped prefix but diverge well before
 * that). Returns null when there is no media (story replies) or nothing
 * usable survives the strip.
 */
export function buildTrackingSrc(
  mediaId: string | null | undefined
): string | null {
  if (!mediaId) return null;

  const cleaned = `ig${mediaId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, TRACKING_SRC_MAX_LENGTH);

  // "ig" alone means the media id contributed nothing — no attribution value.
  if (cleaned === "ig") return null;

  return isValidTrackingSrc(cleaned) ? cleaned : null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/i;

function trimTrailingPunctuation(url: string) {
  return url.replace(/[.,!?;:]+$/, "");
}

export function extractFirstUrl(message: string): string | null {
  const match = message.match(URL_PATTERN);
  if (!match) return null;

  try {
    const url = trimTrailingPunctuation(match[0]);
    return new URL(url).toString();
  } catch {
    return null;
  }
}

export function replaceUrlWithTrackedPlaceholder(
  message: string,
  destinationUrl: string | null | undefined
) {
  if (!destinationUrl) return message;
  if (message.includes(destinationUrl)) {
    return message.replace(destinationUrl, "{link}");
  }

  const withoutTrailingSlash = destinationUrl.replace(/\/$/, "");
  return message.replace(withoutTrailingSlash, "{link}");
}

/**
 * Personalize {username} and strip the {link} token — used when the link is
 * delivered as a separate button rather than inline in the message text.
 */
export function renderMessageWithoutLink({
  message,
  commenterName,
}: {
  message: string;
  commenterName?: string | null;
}) {
  return message
    .replace(/\{username\}/gi, commenterName ?? "there")
    .replace(/\s*\{link\}\s*/gi, " ")
    .trim();
}

export function buildTrackedUrl(
  slug: string,
  baseUrl?: string,
  src?: string | null
) {
  const resolvedBaseUrl =
    baseUrl ??
    (typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXTAUTH_URL ?? "http://localhost:3000");

  const url = `${resolvedBaseUrl.replace(/\/$/, "")}/r/${slug}`;

  // Only append a token that already matches the whitelist, so the tracked URL
  // never needs escaping and never carries a value the destination will reject.
  return isValidTrackingSrc(src) ? `${url}?src=${src}` : url;
}

export function renderMessageWithTracking({
  message,
  commenterName,
  trackedLinks,
  baseUrl,
  src,
}: {
  message: string;
  commenterName?: string | null;
  trackedLinks?: MessageTrackedLink[];
  baseUrl?: string;
  /** Per-post attribution token, see buildTrackingSrc. */
  src?: string | null;
}) {
  let rendered = message.replace(/\{username\}/gi, commenterName ?? "there");
  const primaryLink = trackedLinks?.[0];

  if (!primaryLink) return rendered;

  const trackedUrl = buildTrackedUrl(primaryLink.slug, baseUrl, src);

  if (/\{link\}/i.test(rendered)) {
    return rendered.replace(/\{link\}/gi, trackedUrl);
  }

  if (rendered.includes(primaryLink.destinationUrl)) {
    rendered = rendered.replaceAll(primaryLink.destinationUrl, trackedUrl);
  } else {
    const withoutTrailingSlash = primaryLink.destinationUrl.replace(/\/$/, "");
    rendered = rendered.replaceAll(withoutTrailingSlash, trackedUrl);
  }

  return rendered;
}
