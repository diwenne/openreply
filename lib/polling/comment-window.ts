/**
 * Polling is a safety net for webhook misses after a campaign exists. It must
 * never turn a newly created campaign into an implicit historical backfill.
 */
export function getCampaignCommentSinceMs(
  lookbackSinceMs: number,
  campaignCreatedAt: Date
): number {
  return Math.max(lookbackSinceMs, campaignCreatedAt.getTime());
}

/**
 * Webhook jobs are live events and remain unaffected. Polling jobs must prove
 * that their comment was created after the campaign; older queued jobs did not
 * carry a timestamp, so they fail closed instead of becoming a backfill.
 */
export function shouldProcessCommentForCampaign(
  source: "WEBHOOK" | "POLLING" | undefined,
  commentTimestamp: string | undefined,
  campaignCreatedAt: Date
): boolean {
  if (source !== "POLLING") return true;

  const commentCreatedAtMs = Date.parse(commentTimestamp ?? "");
  return (
    Number.isFinite(commentCreatedAtMs) &&
    commentCreatedAtMs >= campaignCreatedAt.getTime()
  );
}
