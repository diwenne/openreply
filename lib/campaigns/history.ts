/** Audit response whitelist. Never expose provider credentials, queue payloads,
 * operation keys or raw recipient identifiers through campaign history. */
const SNAPSHOT_FIELDS = ["name", "goal", "lifecycle", "version", "isActive", "postId", "postUrl", "pendingNextReel", "matchAnyPost", "keywords", "excludedKeywords", "matchAnyWord", "wholeWordMatch", "priority", "dmTriggerEnabled", "dmMessage", "openingDmEnabled", "openingDmMessage", "openingDmButtonLabel", "linkButtonLabel", "requireFollow", "followPromptMessage", "followPromptButtonLabel", "followUpEnabled", "followUpMessage", "followUpDelayMinutes", "publicReplyEnabled", "publicReplyMessage", "publicReplyMessages"] as const;
export function safeRevisionSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const source = snapshot as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) if (field in source) result[field] = source[field];
  if (Array.isArray(source.trackedLinks)) result.trackedLinks = source.trackedLinks.map((link: unknown) => {
    if (!link || typeof link !== "object" || Array.isArray(link)) return {};
    const item = link as Record<string, unknown>;
    return { label: typeof item.label === "string" ? item.label : null, destinationUrl: typeof item.destinationUrl === "string" ? item.destinationUrl : null, position: typeof item.position === "number" ? item.position : null };
  });
  // Older integration drafts stored destinations directly, without a version.
  // Project only their recorded values; never backfill from today's campaign.
  else {
    const links = [];
    if (typeof source.trackedDestinationUrl === "string") links.push({ label: null, destinationUrl: source.trackedDestinationUrl, position: 0 });
    if (typeof source.secondaryDestinationUrl === "string") links.push({ label: typeof source.secondaryButtonLabel === "string" ? source.secondaryButtonLabel : null, destinationUrl: source.secondaryDestinationUrl, position: 1 });
    if (links.length) result.trackedLinks = links;
  }
  return result;
}
export function safeDeliveryError(error: string | null) {
  return error?.replace(/([?&](?:access_token|token|secret|api_key|key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/((?:access_token|client_secret|api_key|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[redacted]")
    .slice(0, 1000) ?? null;
}
