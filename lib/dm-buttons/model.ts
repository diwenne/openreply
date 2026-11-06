import { z } from "zod";

/**
 * Custom DM buttons for a campaign.
 *
 * A campaign sends up to three DMs, called stages here:
 * - opening: the first DM, sent as the private reply to the comment
 * - followPrompt: "follow first" DM, sent when the follow gate is on and the
 *   person is not (yet) confirmed as a follower
 * - reveal: the DM that delivers the link
 *
 * Each stage carries its own ordered list of buttons. A campaign whose
 * `dmButtons` column is null keeps the original fixed-button behavior.
 *
 * Instagram limits (Instagram API with Instagram Login, checked 2026-11):
 * - Button template: 1-3 buttons, each `web_url` or `postback`, text up to
 *   640 characters. Not shown in the web/desktop client.
 * - Quick replies: up to 13, plain text only, title truncated after 20
 *   characters. A tap arrives as a `messages` webhook with
 *   `message.quick_reply.payload`. Not shown on desktop.
 * - Private replies (the reply to a comment): exactly one message per
 *   comment. Meta documents text and button templates for them, not quick
 *   replies, so quick replies in a private reply are sent as postback buttons.
 */

export const DM_BUTTON_TYPES = [
  "visit_profile",
  "url",
  "quick_reply",
  "follow_confirm",
] as const;
export type DmButtonType = (typeof DM_BUTTON_TYPES)[number];

export const QUICK_REPLY_ACTIONS = ["reveal", "reply"] as const;
export type QuickReplyAction = (typeof QUICK_REPLY_ACTIONS)[number];

export const DM_STAGES = ["opening", "followPrompt", "reveal"] as const;
export type DmStage = (typeof DM_STAGES)[number];

/** Button and quick reply titles: Meta truncates after 20 characters. */
export const MAX_BUTTON_LABEL_LENGTH = 20;
/** Button template allows 1-3 buttons. */
export const MAX_TEMPLATE_BUTTONS = 3;
/** Quick replies allow up to 13 options. */
export const MAX_QUICK_REPLIES = 13;
/** Button template text limit. */
export const MAX_TEMPLATE_TEXT_LENGTH = 640;
export const MAX_REPLY_TEXT_LENGTH = 1000;
export const MAX_URL_LENGTH = 2000;

export interface DmButton {
  /** Stable id, used in quick reply payloads. */
  id: string;
  type: DmButtonType;
  label: string;
  enabled: boolean;
  /** visit_profile and url buttons. */
  url?: string;
  /** quick_reply: what a tap does. */
  action?: QuickReplyAction;
  /** quick_reply with action "reply": the message sent back. */
  replyText?: string;
  /** url buttons in the reveal stage: count clicks through a tracked link. */
  track?: boolean;
  /**
   * Set by the server: the tracked link a reveal url button sends through.
   * Ignored when it does not belong to the campaign.
   */
  trackedLinkSlug?: string;
}

export interface DmButtonConfig {
  version: 1;
  opening: DmButton[];
  followPrompt: DmButton[];
  reveal: DmButton[];
}

export const dmButtonSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  type: z.enum(DM_BUTTON_TYPES),
  label: z.string().max(MAX_BUTTON_LABEL_LENGTH),
  enabled: z.boolean(),
  url: z.string().max(MAX_URL_LENGTH).optional(),
  action: z.enum(QUICK_REPLY_ACTIONS).optional(),
  replyText: z.string().max(MAX_REPLY_TEXT_LENGTH).optional(),
  track: z.boolean().optional(),
  trackedLinkSlug: z.string().max(64).optional(),
});

// Per-stage cap is the quick reply maximum; the stricter template limit is a
// validation rule because it depends on how the stage is delivered.
const stageSchema = z.array(dmButtonSchema).max(MAX_QUICK_REPLIES);

export const dmButtonConfigSchema = z.object({
  version: z.literal(1),
  opening: stageSchema,
  followPrompt: stageSchema,
  reveal: stageSchema,
});

/**
 * Read a stored config. Anything that does not parse is treated as "no custom
 * buttons", so a bad row falls back to the original behavior instead of
 * breaking delivery.
 */
export function parseDmButtonConfig(value: unknown): DmButtonConfig | null {
  if (value === null || value === undefined) return null;
  const parsed = dmButtonConfigSchema.safeParse(value);
  return parsed.success ? (parsed.data as DmButtonConfig) : null;
}

export function activeButtons(buttons: DmButton[]): DmButton[] {
  return buttons.filter((button) => button.enabled);
}

export function newButtonId(): string {
  return `b${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** True when a tap on this button moves the person towards the link. */
export function isAdvancingButton(button: DmButton): boolean {
  return (
    button.type === "follow_confirm" ||
    (button.type === "quick_reply" && (button.action ?? "reveal") === "reveal")
  );
}

export function findButton(
  config: DmButtonConfig,
  buttonId: string
): { stage: DmStage; button: DmButton } | null {
  for (const stage of DM_STAGES) {
    const button = config[stage].find((b) => b.id === buttonId);
    if (button) return { stage, button };
  }
  return null;
}

export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

/**
 * Buttons equivalent to a campaign's original fixed-button settings. Shown
 * when a campaign saved before custom buttons is opened, so saving it again
 * sends exactly what it sent before.
 */
export function deriveDmButtonsFromLegacy(campaign: {
  openingDmButtonLabel?: string | null;
  requireFollow?: boolean;
  followPromptButtonLabel?: string | null;
  linkButtonLabel?: string | null;
  trackedLinks?: { slug?: string; label?: string | null; destinationUrl: string }[];
}): DmButtonConfig {
  const label = (text: string) => text.slice(0, MAX_BUTTON_LABEL_LENGTH);
  const openingLabel = campaign.openingDmButtonLabel?.trim();
  const opening: DmButton[] = openingLabel
    ? [
        campaign.requireFollow
          ? { id: newButtonId(), type: "follow_confirm", label: label(openingLabel), enabled: true }
          : { id: newButtonId(), type: "quick_reply", label: label(openingLabel), enabled: true, action: "reveal" },
      ]
    : [];
  // A follow-gated campaign without its own label sends the original
  // default, so that is what it shows; anything else starts empty.
  const followPrompt: DmButton[] = campaign.requireFollow
    ? [
        {
          id: newButtonId(),
          type: "follow_confirm",
          label: label(campaign.followPromptButtonLabel || "i'm following"),
          enabled: true,
        },
      ]
    : [];
  const reveal: DmButton[] = (campaign.trackedLinks ?? [])
    .slice(0, MAX_TEMPLATE_BUTTONS)
    .map((link, index) => ({
      id: newButtonId(),
      type: "url" as const,
      // The label each link is sent with today.
      label: label((index === 0 ? campaign.linkButtonLabel : link.label) || link.label || "Open link"),
      enabled: true,
      url: link.destinationUrl,
      track: true,
      ...(link.slug ? { trackedLinkSlug: link.slug } : {}),
    }));
  return { version: 1, opening, followPrompt, reveal };
}
