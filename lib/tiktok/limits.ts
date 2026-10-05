/** TikTok rejects reply text longer than this. */
export const TIKTOK_REPLY_MAX_LENGTH = 150;

/**
 * Length as a person counts it: an emoji is one character, not two UTF-16
 * units. TikTok documents the limit as "150 characters"; counting code points
 * keeps us at or under it either way for everything but combined emoji.
 */
export function tiktokReplyLength(text: string): number {
  return [...text].length;
}
