"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import {
  MAX_BUTTON_LABEL_LENGTH,
  MAX_QUICK_REPLIES,
  MAX_REPLY_TEXT_LENGTH,
  newButtonId,
  type DmButton,
  type DmButtonType,
  type DmStage,
} from "@/lib/dm-buttons/model";
import type { DmButtonIssue } from "@/lib/dm-buttons/validate";

/**
 * Edits one stage's buttons: add, edit, enable/disable, delete and reorder
 * (drag or the arrow buttons). Limits and warnings come from the shared
 * validator, so they match what the server enforces.
 */

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export function useIssueText() {
  const { t } = useI18n();
  return (issue: DmButtonIssue): string => {
    const max = Number(issue.params?.max ?? 0);
    switch (issue.code) {
      case "label_required":
        return t("Button label is required.");
      case "label_too_long":
        return t("Button label must be {max} characters or fewer.", { max });
      case "url_required":
        return t("Destination URL is required.");
      case "url_invalid":
        return t("Enter a full URL starting with https://");
      case "profile_url_not_instagram":
        return t("Visit Profile usually points to an instagram.com profile URL.");
      case "reply_text_required":
        return t("Add the message this quick reply sends back.");
      case "too_many_template_buttons":
        return t(
          "Instagram's button template allows at most {max} buttons. Disable or delete {extra}, or use only Quick Replies in a regular DM.",
          { max, extra: Number(issue.params?.extra ?? 0) }
        );
      case "too_many_quick_replies":
        return t("Instagram allows at most {max} quick replies.", { max });
      case "duplicate_id":
        return t("Two buttons share the same id.");
      case "no_advancing_button":
        return t(
          "Add an enabled Follow Confirmation or Quick Reply (send link) button so people can continue."
        );
      case "quick_reply_as_postback":
        return issue.params?.reason === "private_reply"
          ? t(
              "This DM is the reply to the comment, which Instagram sends as a button template, so quick replies here are sent as postback buttons with the same tap behavior."
            )
          : issue.params?.reason === "zernio"
            ? t(
                "Zernio sends buttons as a button template, so quick replies are sent as postback buttons with the same tap behavior."
              )
            : t(
                "Quick replies can't be mixed with link or follow buttons in one message, so they are sent as postback buttons with the same tap behavior."
              );
      case "follow_confirm_without_gate":
        return t(
          "The follow requirement is off, so this button sends the link without checking the follow."
        );
      case "reveal_loops":
        return t("On the link DM, this button sends the link DM again.");
      case "desktop_unsupported":
        return t(
          "Instagram shows DM buttons and quick replies only in the mobile app, not on web or desktop."
        );
    }
  };
}

// Same toggle as the rest of the campaign builder.
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-zinc-300"}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

// The type a new button starts as: the one each DM usually needs. Its text
// and link start empty for the user to fill in.
const NEW_BUTTON_TYPE: Record<DmStage, DmButtonType> = {
  opening: "quick_reply",
  followPrompt: "follow_confirm",
  reveal: "url",
};

export default function DmButtonEditor({
  stage,
  buttons,
  onChange,
  issues,
  profileUrl,
}: {
  stage: DmStage;
  buttons: DmButton[];
  onChange: (buttons: DmButton[]) => void;
  /** Issues for this stage only. */
  issues: DmButtonIssue[];
  /** Shown as the placeholder of a Visit Profile link. */
  profileUrl: string;
}) {
  const { t } = useI18n();
  const issueText = useIssueText();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Only the handle starts a drag, so text in the inputs stays selectable.
  const [armedIndex, setArmedIndex] = useState<number | null>(null);

  const typeLabels: Record<DmButtonType, string> = {
    visit_profile: t("Visit Profile"),
    url: t("Custom URL"),
    quick_reply: t("Quick Reply"),
    follow_confirm: t("Follow Confirmation"),
  };

  function update(index: number, patch: Partial<DmButton>) {
    onChange(buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= buttons.length || from === to) return;
    const next = [...buttons];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function add() {
    const type = NEW_BUTTON_TYPE[stage];
    const button: DmButton = {
      id: newButtonId(),
      type,
      label: "",
      enabled: true,
      ...(type === "url" ? { url: "", track: true } : {}),
      ...(type === "quick_reply" ? { action: "reveal" as const } : {}),
    };
    onChange([...buttons, button]);
  }

  const stageIssues = issues.filter((issue) => !issue.buttonId);
  const note = (issue: DmButtonIssue, key: number) => (
    <p key={key} className={`text-xs ${issue.level === "error" ? "text-error" : "text-muted"}`}>
      {issueText(issue)}
    </p>
  );

  return (
    <div className="space-y-2" data-stage={stage}>
      {buttons.map((button, index) => (
        <div
          key={button.id}
          draggable={armedIndex === index}
          onDragStart={(e) => {
            setDragIndex(index);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) move(dragIndex, index);
            setDragIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setArmedIndex(null);
          }}
          className={`space-y-2 border-t border-border pt-2 ${dragIndex === index ? "opacity-50" : ""} ${
            button.enabled ? "" : "[&_input]:opacity-60 [&_select]:opacity-60 [&_textarea]:opacity-60"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 cursor-grab select-none text-muted"
              title={t("Drag to reorder")}
              onMouseDown={() => setArmedIndex(index)}
              onMouseUp={() => setArmedIndex(null)}
              aria-hidden
            >
              ⋮⋮
            </span>
            <select
              value={button.type}
              onChange={(e) => {
                const type = e.target.value as DmButtonType;
                update(index, {
                  type,
                  url: type === "visit_profile" || type === "url" ? button.url ?? "" : undefined,
                  action: type === "quick_reply" ? button.action ?? "reveal" : undefined,
                  track: type === "url" && stage === "reveal" ? button.track ?? true : undefined,
                });
              }}
              aria-label={t("Button type")}
              className={INPUT}
            >
              {(Object.keys(typeLabels) as DmButtonType[]).map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
            <Toggle
              on={button.enabled}
              onToggle={() => update(index, { enabled: !button.enabled })}
              label={button.enabled ? t("Enabled") : t("Disabled")}
            />
            <button
              type="button"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={t("Move up")}
              title={t("Move up")}
              className="shrink-0 text-muted hover:text-foreground disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(index, index + 1)}
              disabled={index === buttons.length - 1}
              aria-label={t("Move down")}
              title={t("Move down")}
              className="shrink-0 text-muted hover:text-foreground disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => onChange(buttons.filter((_, i) => i !== index))}
              aria-label={t("Delete")}
              title={t("Delete")}
              className="shrink-0 px-1 text-muted hover:text-error"
            >
              ✕
            </button>
          </div>

          <input
            value={button.label}
            onChange={(e) => update(index, { label: e.target.value })}
            placeholder={t("Button label")}
            maxLength={MAX_BUTTON_LABEL_LENGTH}
            aria-label={t("Button label")}
            className={INPUT}
          />

          {(button.type === "url" || button.type === "visit_profile") && (
            <input
              value={button.url ?? ""}
              onChange={(e) => update(index, { url: e.target.value })}
              placeholder={button.type === "visit_profile" ? profileUrl : "https://yourlink.com/offer"}
              aria-label={t("Destination URL")}
              inputMode="url"
              className={INPUT}
            />
          )}

          {button.type === "url" && stage === "reveal" && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={button.track !== false}
                onChange={(e) => update(index, { track: e.target.checked })}
              />
              {t("Track clicks")}
            </label>
          )}

          {button.type === "quick_reply" && (
            <>
              <select
                value={button.action ?? "reveal"}
                onChange={(e) => update(index, { action: e.target.value as "reveal" | "reply" })}
                aria-label={t("On tap")}
                className={INPUT}
              >
                <option value="reveal">{t("Send the link")}</option>
                <option value="reply">{t("Send a reply message")}</option>
              </select>
              {button.action === "reply" && (
                <textarea
                  value={button.replyText ?? ""}
                  onChange={(e) => update(index, { replyText: e.target.value })}
                  placeholder={t("Reply message")}
                  maxLength={MAX_REPLY_TEXT_LENGTH}
                  rows={2}
                  className={`${INPUT} resize-none`}
                />
              )}
            </>
          )}

          {issues.filter((issue) => issue.buttonId === button.id).map(note)}
        </div>
      ))}

      {stageIssues.map(note)}

      {buttons.length < MAX_QUICK_REPLIES && (
        <button
          type="button"
          onClick={add}
          className="w-full rounded-lg border border-border py-2 text-sm text-muted hover:text-foreground"
        >
          {t("+ Add button")}
        </button>
      )}
    </div>
  );
}
