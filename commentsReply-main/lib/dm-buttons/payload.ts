import {
  activeButtons,
  MAX_BUTTON_LABEL_LENGTH,
  MAX_QUICK_REPLIES,
  MAX_TEMPLATE_BUTTONS,
  MAX_TEMPLATE_TEXT_LENGTH,
  type DmButton,
  type DmStage,
} from "./model";

/**
 * Builds the exact message a stage sends. The worker sends what this returns,
 * and the builder preview renders it, so the two cannot drift apart.
 */

/** How the stage reaches the person. */
export type DeliveryChannel = "private_reply" | "direct";
export type MessagingProvider = "META" | "ZERNIO";

export type TemplateButton =
  | { type: "web_url"; title: string; url: string; buttonId: string }
  | { type: "postback"; title: string; payload: string; buttonId: string };

export interface QuickReplyOption {
  content_type: "text";
  title: string;
  payload: string;
  buttonId: string;
}

export type BuiltMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: TemplateButton[] }
  | { kind: "quick_replies"; text: string; quickReplies: QuickReplyOption[] };

export const QUICK_REPLY_PAYLOAD_PREFIX = "qr:";

export function quickReplyPayload(automationId: string, buttonId: string) {
  return `${QUICK_REPLY_PAYLOAD_PREFIX}${automationId}:${buttonId}`;
}

export function parseQuickReplyPayload(
  payload: string
): { automationId: string; buttonId: string } | null {
  if (!payload.startsWith(QUICK_REPLY_PAYLOAD_PREFIX)) return null;
  const [automationId, buttonId] = payload
    .slice(QUICK_REPLY_PAYLOAD_PREFIX.length)
    .split(":");
  return automationId && buttonId ? { automationId, buttonId } : null;
}

/** Payload of a Follow Confirmation button; matches the original follow gate. */
export function followConfirmPayload(automationId: string, stage: DmStage) {
  // ":open" tells a tap on the opening DM apart from the follow prompt's own
  // button, exactly as the original opening button did.
  return `followcheck:${automationId}${stage === "opening" ? ":open" : ""}`;
}

/**
 * Whether the stage is sent as a button template rather than quick replies.
 * Quick replies are used only when every active button is a quick reply, the
 * message is a regular DM, and the provider is Meta. Everything else uses the
 * button template, with quick replies sent as postback buttons.
 */
export function usesButtonTemplate(
  buttons: DmButton[],
  channel: DeliveryChannel,
  provider: MessagingProvider
): boolean {
  const active = activeButtons(buttons);
  if (active.length === 0) return false;
  const allQuickReplies = active.every((b) => b.type === "quick_reply");
  return !(allQuickReplies && channel === "direct" && provider === "META");
}

export function buildStageMessage({
  stage,
  buttons,
  text,
  automationId,
  channel,
  provider = "META",
  resolveUrl = (button) => button.url ?? "",
}: {
  stage: DmStage;
  buttons: DmButton[];
  /** Already personalized text. */
  text: string;
  automationId: string;
  channel: DeliveryChannel;
  provider?: MessagingProvider;
  /** Final URL for a url/visit_profile button (e.g. a tracked redirect). */
  resolveUrl?: (button: DmButton) => string;
}): BuiltMessage {
  const active = activeButtons(buttons);
  if (active.length === 0) return { kind: "text", text };

  const title = (button: DmButton) =>
    button.label.trim().slice(0, MAX_BUTTON_LABEL_LENGTH);

  if (!usesButtonTemplate(active, channel, provider)) {
    return {
      kind: "quick_replies",
      text,
      quickReplies: active.slice(0, MAX_QUICK_REPLIES).map((button) => ({
        content_type: "text",
        title: title(button),
        payload: quickReplyPayload(automationId, button.id),
        buttonId: button.id,
      })),
    };
  }

  return {
    kind: "buttons",
    text: text.slice(0, MAX_TEMPLATE_TEXT_LENGTH),
    buttons: active.slice(0, MAX_TEMPLATE_BUTTONS).map((button): TemplateButton => {
      switch (button.type) {
        case "visit_profile":
        case "url":
          return {
            type: "web_url",
            title: title(button),
            url: resolveUrl(button),
            buttonId: button.id,
          };
        case "follow_confirm":
          return {
            type: "postback",
            title: title(button),
            payload: followConfirmPayload(automationId, stage),
            buttonId: button.id,
          };
        case "quick_reply":
          return {
            type: "postback",
            title: title(button),
            payload: quickReplyPayload(automationId, button.id),
            buttonId: button.id,
          };
      }
    }),
  };
}

/** The `message` object Meta's /messages endpoint expects. */
export function toMetaMessage(message: BuiltMessage): Record<string, unknown> {
  switch (message.kind) {
    case "text":
      return { text: message.text };
    case "quick_replies":
      return {
        text: message.text,
        quick_replies: message.quickReplies.map(({ content_type, title, payload }) => ({
          content_type,
          title,
          payload,
        })),
      };
    case "buttons":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: message.text,
            buttons: message.buttons.map((button) =>
              button.type === "web_url"
                ? { type: "web_url", url: button.url, title: button.title }
                : { type: "postback", title: button.title, payload: button.payload }
            ),
          },
        },
      };
  }
}

/**
 * Plain-text version of a button message, for when Meta rejects the template:
 * the text followed by every link on its own line, so no link is lost.
 */
export function toInlineFallbackText(message: BuiltMessage): string {
  if (message.kind !== "buttons") return message.text;
  const urls = message.buttons
    .filter((b): b is Extract<TemplateButton, { type: "web_url" }> => b.type === "web_url")
    .map((b) => b.url);
  return [message.text, ...urls].filter(Boolean).join("\n");
}
