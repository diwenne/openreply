/**
 * Return true only for the single campaign explicitly selected for a temporary
 * comment-recovery run. An exact ID match keeps the owner-reply bypass from
 * affecting any other active campaign in the workspace.
 */
export function isCommentRecoveryCampaign(
  automationId: string,
  configuredId = process.env.COMMENT_POLL_RECOVERY_CAMPAIGN_ID
): boolean {
  const recoveryCampaignId = configuredId?.trim();
  return Boolean(recoveryCampaignId) && recoveryCampaignId === automationId;
}
