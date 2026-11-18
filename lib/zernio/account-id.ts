/**
 * The id to store and compare for a Zernio-managed Instagram account.
 *
 * Webhooks and comment listings identify the account's own comments by
 * metadata.instagramScopedId, not platformUserId. Self-detection compares
 * those author ids against the stored id, so prefer instagramScopedId and fall
 * back to platformUserId only when Zernio omits it.
 */
export function zernioInstagramId(account: {
  platformUserId?: string;
  metadata?: { instagramScopedId?: string } | null;
}): string | undefined {
  return account.metadata?.instagramScopedId ?? account.platformUserId;
}
