"use client";

import { useState, useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { useI18n } from "@/lib/i18n/provider";

export default function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-1">
      <label className="inline-flex items-center gap-2 text-sm text-muted">
        <span>{t("Language")}</span>
        <select
          value={locale}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            const nextLocale = event.target.value;
            setFailed(false);
            startTransition(async () => {
              try {
                await setLocale(nextLocale);
              } catch {
                setFailed(true);
              }
            });
          }}
          className="min-h-9 rounded border border-border bg-surface px-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="zh-TW" lang="zh-TW">
            繁體中文
          </option>
        </select>
      </label>
      {failed && (
        <p role="alert" className="text-xs text-error">
          {t("Could not change language. Please try again.")}
        </p>
      )}
    </div>
  );
}
