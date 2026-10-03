import { matchKeywords } from "@/lib/utils/keyword-matcher";

export const CAMPAIGN_LIFECYCLES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type CampaignLifecycle = (typeof CAMPAIGN_LIFECYCLES)[number];
export interface CampaignRule {
  id: string;
  isActive: boolean;
  lifecycle?: string;
  priority?: number;
  excludedKeywords?: string[];
  createdAt: Date | string;
  postId?: string | null;
  pendingNextReel?: boolean;
  matchAnyPost?: boolean;
  dmTriggerEnabled?: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
}
export interface SelectionInput { kind: "comment" | "dm"; text: string; mediaIds?: string[] }
export function campaignLifecycle(campaign: Pick<CampaignRule, "lifecycle" | "isActive">): CampaignLifecycle {
  return CAMPAIGN_LIFECYCLES.includes(campaign.lifecycle as CampaignLifecycle)
    ? campaign.lifecycle as CampaignLifecycle : campaign.isActive ? "ACTIVE" : "PAUSED";
}
export function campaignCanSend(campaign: Pick<CampaignRule, "lifecycle" | "isActive">) {
  return campaign.isActive && campaignLifecycle(campaign) === "ACTIVE";
}

/** One deterministic rule engine shared by simulation and both worker triggers.
 * Ties are visible, never resolved by DB return order. An incoming DM carries
 * no post context and therefore uses priority only, not specific-post rank. */
export function selectAutomation<T extends CampaignRule>(campaigns: T[], input: SelectionInput) {
  const keywordById = new Map<string, string | null>();
  const specificity = (c: T) => input.kind === "comment" && !c.matchAnyPost ? 1 : 0;
  const matches = campaigns.filter((c) => {
    if (!campaignCanSend(c)) return false;
    if (input.kind === "dm" ? !c.dmTriggerEnabled : c.pendingNextReel || (!c.matchAnyPost && (!c.postId || !input.mediaIds?.includes(c.postId)))) return false;
    if (c.excludedKeywords?.length && matchKeywords(input.text, c.excludedKeywords, c.wholeWordMatch).matched) return false;
    const match = c.matchAnyWord ? { matched: Boolean(input.text.trim()), matchedKeyword: null } : matchKeywords(input.text, c.keywords, c.wholeWordMatch);
    if (match.matched) keywordById.set(c.id, match.matchedKeyword);
    return match.matched;
  }).sort((a, b) => specificity(b) - specificity(a) || (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
  const winner = matches[0] ?? null;
  const conflicts = winner ? matches.filter((c) => c.id !== winner.id && specificity(c) === specificity(winner) && (c.priority ?? 0) === (winner.priority ?? 0)) : [];
  return { winner, matches, conflicts, matchedKeyword: winner ? keywordById.get(winner.id) ?? null : null };
}

export function campaignActivationErrors(c: {
  postId?: string | null; matchAnyPost?: boolean; pendingNextReel?: boolean;
  keywords: string[]; matchAnyWord: boolean; dmMessage: string;
  openingDmEnabled?: boolean; openingDmMessage?: string | null; openingDmButtonLabel?: string | null;
  requireFollow?: boolean; followPromptMessage?: string | null;
  followUpEnabled?: boolean; followUpMessage?: string | null;
  publicReplyEnabled?: boolean; publicReplyMessage?: string | null; publicReplyMessages?: string[];
}) {
  const errors: string[] = [];
  if (!c.matchAnyPost && !c.pendingNextReel && !c.postId) errors.push("Choose a post, all posts, or the next reel.");
  if (c.matchAnyPost && c.pendingNextReel) errors.push("Choose exactly one post scope.");
  if (!c.matchAnyWord && !c.keywords.some((k) => k.trim())) errors.push("Add a keyword or choose any word.");
  if (!c.dmMessage.trim()) errors.push("Add the delivery message.");
  if (c.openingDmEnabled && (!c.openingDmMessage?.trim() || !c.openingDmButtonLabel?.trim())) errors.push("Opening DM needs a message and button label.");
  if (c.requireFollow && !c.followPromptMessage?.trim()) errors.push("Follow gate needs a message.");
  if (c.followUpEnabled && !c.followUpMessage?.trim()) errors.push("Follow-up needs a message.");
  if (c.publicReplyEnabled && !c.publicReplyMessage?.trim() && !c.publicReplyMessages?.some((m) => m.trim())) errors.push("Public reply needs a message.");
  return errors;
}
