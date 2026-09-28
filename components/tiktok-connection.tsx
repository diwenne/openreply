"use client";

/**
 * TikTok connection panel: connected accounts, connect / disconnect, and the
 * owner/admin action that registers this instance's comment webhook with the
 * TikTok app. Renders nothing when TikTok is not configured on the server.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from "react";

export interface TikTokAccountSummary {
  id: string;
  username: string;
  displayName: string | null;
  connectedAt: string;
  needsReconnect: boolean;
}

interface ConnectionData {
  configured: boolean;
  canManage?: boolean;
  webhookUrl?: string;
  accounts?: TikTokAccountSummary[];
}

function fetchAccounts() {
  return fetch("/api/tiktok/accounts", { cache: "no-store" }).then((res) => res.json());
}

export default function TikTokConnection({
  onAccountsLoaded,
}: {
  onAccountsLoaded?: (accounts: TikTokAccountSummary[], canManage: boolean) => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<ConnectionData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback(
    (payload: { success: boolean; data?: ConnectionData }) => {
      if (!payload.success || !payload.data) return;
      setData(payload.data);
      onAccountsLoaded?.(payload.data.accounts ?? [], Boolean(payload.data.canManage));
    },
    [onAccountsLoaded]
  );

  useEffect(() => {
    void fetchAccounts().then(apply);
  }, [apply]);

  async function load() {
    apply(await fetchAccounts());
  }

  async function disconnect(tiktokAccountId: string) {
    if (!confirm(t("Disconnect TikTok? Its campaigns and reply log are deleted."))) return;
    setBusy(`disconnect:${tiktokAccountId}`);
    await fetch("/api/tiktok/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiktokAccountId }),
    });
    setBusy(null);
    await load();
  }

  async function subscribeWebhook() {
    setBusy("webhook");
    setWebhookMessage(null);
    const res = await fetch("/api/tiktok/webhook-subscription", { method: "POST" });
    const payload = await res.json().catch(() => ({ success: false }));
    setWebhookMessage(
      payload.success
        ? { ok: true, text: t("Webhook registered with TikTok.") }
        : { ok: false, text: payload.error ?? t("Could not register the webhook.") }
    );
    setBusy(null);
  }

  if (!data?.configured) return null;
  const accounts = data.accounts ?? [];

  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold mb-6">{t("TikTok Connection")}</h2>

      <div className="space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-muted">
            {t("Connect a TikTok account to reply to comments automatically.")}
          </p>
        )}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-col gap-3 rounded border border-border bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-foreground">@{account.username}</p>
              <p className={`mt-1 text-xs ${account.needsReconnect ? "text-warning" : "text-muted"}`}>
                {account.needsReconnect
                  ? t("Reconnect needed: access was revoked, expired, or the comment permissions were not granted.")
                  : account.displayName ?? t("Connected")}
              </p>
            </div>
            {data.canManage && (
              <button
                onClick={() => disconnect(account.id)}
                disabled={busy === `disconnect:${account.id}`}
                className="inline-flex items-center justify-center rounded border border-error/20 px-4 py-2 text-sm font-medium text-error transition-all hover:border-error/40 hover:bg-error/10 disabled:opacity-50"
              >
                {busy === `disconnect:${account.id}` ? t("Disconnecting...") : t("Disconnect")}
              </button>
            )}
          </div>
        ))}
      </div>

      {data.canManage ? (
        <div className="mt-6 pt-4 border-t border-border space-y-4">
          <a
            href="/api/tiktok/connect"
            className="inline-block px-4 py-2 rounded text-sm font-medium transition-colors bg-accent text-white hover:bg-accent-hover"
          >
            {accounts.length > 0 ? t("Connect another TikTok account") : t("Connect TikTok")}
          </a>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("Comment webhook")}</p>
            <p className="text-xs text-muted">
              {t("Optional. Comments are also checked every few minutes without it. Registers this URL for the whole TikTok app:")}{" "}
              <span className="font-mono break-all">{data.webhookUrl}</span>
            </p>
            <button
              type="button"
              onClick={subscribeWebhook}
              disabled={busy === "webhook"}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground disabled:opacity-50"
            >
              {busy === "webhook" ? t("Registering...") : t("Register comment webhook")}
            </button>
            {webhookMessage && (
              <p className={`text-xs ${webhookMessage.ok ? "text-success" : "text-error"}`}>
                {webhookMessage.text}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">
          {t("Ask your workspace owner or admin to connect TikTok.")}
        </p>
      )}
    </section>
  );
}
