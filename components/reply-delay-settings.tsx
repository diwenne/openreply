"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";

export interface ReplyDelayAccount {
  id: string;
  publicReplyDelayMinSeconds: number;
  publicReplyDelayMaxSeconds: number;
  dmDelayMinSeconds: number;
  dmDelayMaxSeconds: number;
}

const MAX_SECONDS = 60 * 60;

function DelayRange({
  label,
  hint,
  minValue,
  maxValue,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  minValue: number;
  maxValue: number;
  onChange: (next: { min: number; max: number }) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const inputClass =
    "mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40 disabled:opacity-50";

  return (
    <div>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wide text-muted">
            {t("Min")}
          </span>
          <input
            type="number"
            min={0}
            max={MAX_SECONDS}
            step={1}
            value={minValue}
            onChange={(event) =>
              onChange({ min: Number(event.target.value), max: maxValue })
            }
            disabled={disabled}
            aria-label={`${label} ${t("Min")}`}
            className={inputClass}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wide text-muted">
            {t("Max")}
          </span>
          <input
            type="number"
            min={0}
            max={MAX_SECONDS}
            step={1}
            value={maxValue}
            onChange={(event) =>
              onChange({ min: minValue, max: Number(event.target.value) })
            }
            disabled={disabled}
            aria-label={`${label} ${t("Max")}`}
            className={inputClass}
          />
        </label>
        <span className="pb-2 text-xs text-muted">{t("sec")}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

/**
 * Per-account reply pacing. Each leg waits a random number of seconds drawn
 * from its range, so replies never land on a fixed interval. Both legs default
 * to 0/0, which keeps the previous send-immediately behaviour.
 */
export function ReplyDelaySettings({ account }: { account: ReplyDelayAccount }) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    publicReplyDelayMinSeconds: account.publicReplyDelayMinSeconds ?? 0,
    publicReplyDelayMaxSeconds: account.publicReplyDelayMaxSeconds ?? 0,
    dmDelayMinSeconds: account.dmDelayMinSeconds ?? 0,
    dmDelayMaxSeconds: account.dmDelayMaxSeconds ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<typeof values>) {
    setValues((current) => ({ ...current, ...patch }));
    setSaved(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/instagram/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(payload.error ?? t("Could not save reply timing"));
        return;
      }
      setValues(payload.data);
      setSaved(true);
    } catch {
      setError(t("Could not save reply timing"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{t("Reply timing")}</p>
        <p className="text-xs text-muted">{t("Random wait per comment")}</p>
      </div>
      <p className="mt-1 text-xs text-muted">
        {t(
          "Each reply waits a random number of seconds drawn from its range, so replies do not arrive on a fixed interval. 0 and 0 sends immediately."
        )}
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <DelayRange
          label={t("Public comment reply")}
          hint={t("Before posting the visible reply under the comment.")}
          minValue={values.publicReplyDelayMinSeconds}
          maxValue={values.publicReplyDelayMaxSeconds}
          disabled={busy}
          onChange={({ min, max }) =>
            update({
              publicReplyDelayMinSeconds: min,
              publicReplyDelayMaxSeconds: max,
            })
          }
        />
        <DelayRange
          label={t("DM")}
          hint={t(
            "Before sending the private reply or answering an inbound DM."
          )}
          minValue={values.dmDelayMinSeconds}
          maxValue={values.dmDelayMaxSeconds}
          disabled={busy}
          onChange={({ min, max }) =>
            update({ dmDelayMinSeconds: min, dmDelayMaxSeconds: max })
          }
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? t("Saving...") : t("Save timing")}
        </button>
        {saved && <span className="text-xs text-success">{t("Timing saved")}</span>}
        {error && <span className="text-xs text-error">{error}</span>}
      </div>
    </div>
  );
}
