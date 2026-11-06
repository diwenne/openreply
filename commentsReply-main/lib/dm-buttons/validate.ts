import {
  activeButtons,
  DM_STAGES,
  isAdvancingButton,
  MAX_BUTTON_LABEL_LENGTH,
  MAX_QUICK_REPLIES,
  MAX_TEMPLATE_BUTTONS,
  type DmButton,
  type DmButtonConfig,
  type DmStage,
} from "./model";
import {
  usesButtonTemplate,
  type DeliveryChannel,
  type MessagingProvider,
} from "./payload";

export type DmButtonIssueCode =
  | "label_required"
  | "label_too_long"
  | "url_required"
  | "url_invalid"
  | "profile_url_not_instagram"
  | "reply_text_required"
  | "too_many_template_buttons"
  | "too_many_quick_replies"
  | "duplicate_id"
  | "no_advancing_button"
  | "quick_reply_as_postback"
  | "follow_confirm_without_gate"
  | "reveal_loops"
  | "desktop_unsupported";

export interface DmButtonIssue {
  level: "error" | "warning";
  code: DmButtonIssueCode;
  stage: DmStage;
  buttonId?: string;
  /** English text for API responses and logs; the UI translates by code. */
  message: string;
  params?: Record<string, string | number>;
}

export interface DmButtonContext {
  openingDmEnabled: boolean;
  requireFollow: boolean;
  dmTriggerEnabled?: boolean;
  provider?: MessagingProvider;
}

/** Stages this campaign actually sends. */
export function stagesInUse(context: DmButtonContext): DmStage[] {
  return DM_STAGES.filter(
    (stage) =>
      stage === "reveal" ||
      (stage === "opening" && context.openingDmEnabled) ||
      (stage === "followPrompt" && context.requireFollow)
  );
}

/**
 * The channel a stage is first delivered on for a comment. The opening DM is
 * always the private reply. Without an opening DM, the follow prompt or the
 * reveal is the private reply instead; with one, both are regular DMs.
 */
export function stageCommentChannel(
  stage: DmStage,
  context: DmButtonContext
): DeliveryChannel {
  if (stage === "opening") return "private_reply";
  return context.openingDmEnabled ? "direct" : "private_reply";
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am";
  } catch {
    return false;
  }
}

function validateButton(stage: DmStage, button: DmButton, issues: DmButtonIssue[]) {
  // A disabled button is never sent, so its problems warn instead of
  // blocking the save; they become errors once it is switched on.
  const push = (
    level: DmButtonIssue["level"],
    code: DmButtonIssueCode,
    message: string,
    params?: DmButtonIssue["params"]
  ) =>
    issues.push({
      level: button.enabled ? level : "warning",
      code,
      stage,
      buttonId: button.id,
      message,
      params,
    });

  const label = button.label.trim();
  if (!label) push("error", "label_required", "Button label is required.");
  if (label.length > MAX_BUTTON_LABEL_LENGTH)
    push("error", "label_too_long", `Button label must be ${MAX_BUTTON_LABEL_LENGTH} characters or fewer.`, {
      max: MAX_BUTTON_LABEL_LENGTH,
    });

  if (button.type === "url" || button.type === "visit_profile") {
    const url = button.url?.trim() ?? "";
    if (!url) push("error", "url_required", "Destination URL is required.");
    else if (!isValidHttpUrl(url))
      push("error", "url_invalid", "Enter a full URL starting with https://");
    else if (button.type === "visit_profile" && !isInstagramUrl(url))
      push(
        "warning",
        "profile_url_not_instagram",
        "Visit Profile usually points to an instagram.com profile URL."
      );
  }

  if (button.type === "quick_reply" && button.action === "reply" && !button.replyText?.trim()) {
    push("error", "reply_text_required", "Add the message this quick reply sends back.");
  }
}

/**
 * Check a config against Meta's limits and the campaign flow. Only enabled
 * buttons count towards limits; disabled ones are still checked, as warnings,
 * so they can be switched on later without surprises.
 */
export function validateDmButtonConfig(
  config: DmButtonConfig,
  context: DmButtonContext
): DmButtonIssue[] {
  const issues: DmButtonIssue[] = [];
  const provider = context.provider ?? "META";
  const seen = new Set<string>();
  let desktopNoted = false;

  for (const stage of DM_STAGES) {
    for (const button of config[stage]) {
      if (seen.has(button.id)) {
        issues.push({
          level: "error",
          code: "duplicate_id",
          stage,
          buttonId: button.id,
          message: "Two buttons share the same id.",
        });
      }
      seen.add(button.id);
    }
  }

  for (const stage of stagesInUse(context)) {
    const buttons = config[stage];
    const active = activeButtons(buttons);
    for (const button of buttons) validateButton(stage, button, issues);

    // The DM trigger always talks over an open conversation, so the reveal
    // and follow prompt can be direct even when the comment path is not.
    const commentChannel = stageCommentChannel(stage, context);
    const templateOnComment = usesButtonTemplate(active, commentChannel, provider);
    const templateOnDirect = usesButtonTemplate(active, "direct", provider);
    const anyTemplate = templateOnComment || (stage !== "opening" && templateOnDirect);

    if (anyTemplate && active.length > MAX_TEMPLATE_BUTTONS) {
      issues.push({
        level: "error",
        code: "too_many_template_buttons",
        stage,
        message: `Instagram's button template allows at most ${MAX_TEMPLATE_BUTTONS} buttons. Disable or delete ${active.length - MAX_TEMPLATE_BUTTONS}, or use only Quick Replies in a regular DM.`,
        params: { max: MAX_TEMPLATE_BUTTONS, extra: active.length - MAX_TEMPLATE_BUTTONS },
      });
    }
    if (active.length > MAX_QUICK_REPLIES) {
      issues.push({
        level: "error",
        code: "too_many_quick_replies",
        stage,
        message: `Instagram allows at most ${MAX_QUICK_REPLIES} quick replies.`,
        params: { max: MAX_QUICK_REPLIES },
      });
    }

    const quickReplies = active.filter((b) => b.type === "quick_reply");
    if (quickReplies.length > 0 && templateOnComment) {
      issues.push({
        level: "warning",
        code: "quick_reply_as_postback",
        stage,
        message:
          commentChannel === "private_reply"
            ? "This DM is the reply to the comment, which Instagram sends as a button template, so quick replies here are sent as postback buttons with the same tap behavior."
            : provider === "ZERNIO"
              ? "Zernio sends buttons as a button template, so quick replies are sent as postback buttons with the same tap behavior."
              : "Quick replies can't be mixed with link or follow buttons in one message, so they are sent as postback buttons with the same tap behavior.",
        params: {
          reason:
            commentChannel === "private_reply"
              ? "private_reply"
              : provider === "ZERNIO"
                ? "zernio"
                : "mixed",
        },
      });
    }

    if (
      (stage === "opening" || stage === "followPrompt") &&
      !active.some(isAdvancingButton)
    ) {
      issues.push({
        level: "error",
        code: "no_advancing_button",
        stage,
        message:
          "Add an enabled Follow Confirmation or Quick Reply (send link) button so people can continue.",
      });
    }

    for (const button of active) {
      if (button.type === "follow_confirm" && !context.requireFollow && stage !== "reveal") {
        issues.push({
          level: "warning",
          code: "follow_confirm_without_gate",
          stage,
          buttonId: button.id,
          message: "The follow requirement is off, so this button sends the link without checking the follow.",
        });
      }
      if (stage === "reveal" && isAdvancingButton(button)) {
        issues.push({
          level: "warning",
          code: "reveal_loops",
          stage,
          buttonId: button.id,
          message: "On the link DM, this button sends the link DM again.",
        });
      }
    }

    if (active.length > 0 && !desktopNoted) {
      desktopNoted = true;
      issues.push({
        level: "warning",
        code: "desktop_unsupported",
        stage,
        message: "Instagram shows DM buttons and quick replies only in the mobile app, not on web or desktop.",
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: DmButtonIssue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}
