"use client";

/**
 * TikTok page: connection, keyword campaigns with a create/edit form, and the
 * recent reply log. Campaigns post a public reply; TikTok's comment-to-DM API
 * is region-restricted, so there is no DM step here.
 */

import KeywordInput from "@/components/keyword-input";
import TikTokConnection, { type TikTokAccountSummary } from "@/components/tiktok-connection";
import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { TIKTOK_REPLY_MAX_LENGTH, tiktokReplyLength } from "@/lib/tiktok/limits";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Campaign {
  id: string;
  tiktokAccountId: string;
  name: string;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
  matchAnyVideo: boolean;
  videoId: string | null;
  videoCaption: string | null;
  replyMessages: string[];
  isActive: boolean;
  repliedCount: number;
  tiktokAccount: { username: string };
}

interface ReplyLog {
  id: string;
  commentText: string;
  commenterName: string | null;
  status: "PENDING" | "REPLIED" | "SKIPPED" | "FAILED" | "UNCONFIRMED";
  replyText: string | null;
  errorMessage: string | null;
  createdAt: string;
  campaign: { name: string } | null;
}

interface Video {
  id: string;
  caption: string;
  createTime: number | null;
}

type Draft = Omit<Campaign, "id" | "repliedCount" | "tiktokAccount"> & { id?: string };

const STATUS: Record<ReplyLog["status"], { label: StaticMessageKey; className: string }> = {
  REPLIED: { label: "Replied", className: "text-success" },
  PENDING: { label: "Pending", className: "text-warning" },
  SKIPPED: { label: "Skipped", className: "text-muted" },
  FAILED: { label: "Failed", className: "text-error" },
  UNCONFIRMED: { label: "Unconfirmed", className: "text-warning" },
};

const NOTICES: Record<string, { tone: "success" | "warning" | "error"; text: StaticMessageKey }> = {
  connected: { tone: "success", text: "TikTok account connected." },
  denied: { tone: "warning", text: "TikTok connection cancelled." },
  invalid: { tone: "error", text: "The TikTok login link was missing or older than 10 minutes. Try again." },
  invalid_scope: { tone: "error", text: "TikTok refused the requested permissions. Check the scopes approved for your TikTok app." },
  missing_scope: { tone: "error", text: "Grant the comment permissions when connecting, or replies cannot be sent." },
  forbidden: { tone: "error", text: "Only workspace owners and admins can connect a TikTok account." },
  already_connected: { tone: "warning", text: "That TikTok account is connected to another workspace." },
  misconfigured: { tone: "error", text: "TikTok is not fully configured on the server. See docs/tiktok.md." },
  failed: { tone: "error", text: "TikTok accepted the login but the connection could not be completed." },
};

const TONES = {
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  error: "border-error/20 bg-error/10 text-error",
};

const inputClass =
  "w-full rounded border border-border bg-surface px-4 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40";
const smallButton =
  "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground disabled:opacity-50";

async function fetchCampaignsAndLogs(): Promise<{
  campaigns: Campaign[] | null;
  logs: ReplyLog[] | null;
}> {
  const [campaignRes, logRes] = await Promise.all([
    fetch("/api/tiktok/campaigns", { cache: "no-store" }).then((r) => r.json()),
    fetch("/api/tiktok/logs", { cache: "no-store" }).then((r) => r.json()),
  ]);
  return {
    campaigns: campaignRes.success ? campaignRes.data : null,
    logs: logRes.success ? logRes.data : null,
  };
}

export function TikTokConnectNotice() {
  const { t } = useI18n();
  const params = useSearchParams();
  const notice = NOTICES[params.get("tiktok") ?? ""];
  if (!notice) return null;
  const reason = params.get("reason") ?? params.get("missing");
  return (
    <div className={`rounded border p-4 text-sm ${TONES[notice.tone]}`}>
      <p>{t(notice.text)}</p>
      {reason && <p className="mt-2 font-mono text-xs break-words opacity-80">{reason}</p>}
    </div>
  );
}

export default function TikTokDashboard() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<TikTokAccountSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<ReplyLog[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const apply = useCallback((data: Awaited<ReturnType<typeof fetchCampaignsAndLogs>>) => {
    if (data.campaigns) setCampaigns(data.campaigns);
    if (data.logs) setLogs(data.logs);
  }, []);

  useEffect(() => {
    void fetchCampaignsAndLogs().then(apply);
  }, [apply]);

  async function load() {
    apply(await fetchCampaignsAndLogs());
  }

  const onAccountsLoaded = useCallback((list: TikTokAccountSummary[], manage: boolean) => {
    setAccounts(list);
    setCanManage(manage);
  }, []);

  async function toggle(campaign: Campaign) {
    await fetch(`/api/tiktok/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !campaign.isActive }),
    });
    await load();
  }

  async function remove(campaign: Campaign) {
    if (!confirm(t("Delete this TikTok campaign?"))) return;
    await fetch(`/api/tiktok/campaigns/${campaign.id}`, { method: "DELETE" });
    await load();
  }

  function newDraft(): Draft {
    return {
      tiktokAccountId: accounts[0]?.id ?? "",
      name: "",
      keywords: [],
      matchAnyWord: false,
      wholeWordMatch: true,
      matchAnyVideo: true,
      videoId: null,
      videoCaption: null,
      replyMessages: ["", ""],
      isActive: true,
    };
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <TikTokConnection onAccountsLoaded={onAccountsLoaded} />

      <section className="panel rounded p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-semibold">{t("TikTok campaigns")}</h2>
            <p className="mt-1 text-xs text-muted">
              {t("Reply publicly to comments that contain a keyword.")}
            </p>
          </div>
          {canManage && accounts.length > 0 && !draft && (
            <button
              type="button"
              onClick={() => setDraft(newDraft())}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("New TikTok campaign")}
            </button>
          )}
        </div>

        {draft && (
          <CampaignForm
            draft={draft}
            accounts={accounts}
            onCancel={() => setDraft(null)}
            onSaved={async () => {
              setDraft(null);
              await load();
            }}
          />
        )}

        <div className="space-y-3">
          {campaigns.length === 0 && !draft && (
            <p className="text-sm text-muted">{t("No TikTok campaigns yet.")}</p>
          )}
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex flex-col gap-3 rounded border border-border bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {campaign.name}{" "}
                  <span className={`text-xs font-normal ${campaign.isActive ? "text-success" : "text-muted"}`}>
                    {campaign.isActive ? t("Active") : t("Paused")}
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  @{campaign.tiktokAccount.username} ·{" "}
                  {campaign.matchAnyVideo ? t("All videos") : campaign.videoCaption || campaign.videoId} ·{" "}
                  {campaign.matchAnyWord ? t("Any word") : campaign.keywords.join(", ")} ·{" "}
                  {t("{count} replied", { count: campaign.repliedCount })}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={smallButton} onClick={() => toggle(campaign)}>
                    {campaign.isActive ? t("Pause") : t("Resume")}
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => setDraft({ ...campaign, replyMessages: [...campaign.replyMessages] })}
                  >
                    {t("Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(campaign)}
                    className="rounded-lg border border-error/20 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10"
                  >
                    {t("Delete")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel rounded overflow-hidden">
        <h2 className="text-base font-semibold px-4 pt-4 sm:px-6 sm:pt-6">{t("Recent TikTok replies")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Comment")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Campaign")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Status")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Time")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted sm:px-6">
                    {t("No TikTok replies yet.")}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-4 max-w-[260px] sm:px-6">
                      <span className="block truncate text-foreground">
                        {log.commenterName ? `@${log.commenterName}: ` : ""}
                        {log.commentText || t("(no text)")}
                      </span>
                      {log.replyText && (
                        <span className="block truncate text-xs text-muted">↳ {log.replyText}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-muted sm:px-6">{log.campaign?.name ?? "—"}</td>
                    <td className="px-4 py-4 sm:px-6" title={log.errorMessage ?? undefined}>
                      <span className={STATUS[log.status].className}>{t(STATUS[log.status].label)}</span>
                    </td>
                    <td className="px-4 py-4 text-muted whitespace-nowrap sm:px-6">
                      {new Date(log.createdAt).toLocaleString(locale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CampaignForm({
  draft: initial,
  accounts,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  accounts: TikTokAccountSummary[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<Draft>(initial);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (draft.matchAnyVideo || !draft.tiktokAccountId) return;
    let cancelled = false;
    fetch(`/api/tiktok/videos?tiktokAccountId=${encodeURIComponent(draft.tiktokAccountId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.success) setVideos(payload.data.videos);
        else setVideoError(payload.error ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.matchAnyVideo, draft.tiktokAccountId]);

  const tooLong = draft.replyMessages.some((m) => tiktokReplyLength(m.trim()) > TIKTOK_REPLY_MAX_LENGTH);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: draft.name,
      keywords: draft.keywords,
      matchAnyWord: draft.matchAnyWord,
      wholeWordMatch: draft.wholeWordMatch,
      matchAnyVideo: draft.matchAnyVideo,
      videoId: draft.matchAnyVideo ? null : draft.videoId,
      videoCaption: draft.matchAnyVideo ? null : draft.videoCaption?.slice(0, 300) ?? null,
      replyMessages: draft.replyMessages.map((m) => m.trim()).filter(Boolean),
      isActive: draft.isActive,
      ...(draft.id ? {} : { tiktokAccountId: draft.tiktokAccountId }),
    };
    const res = await fetch(draft.id ? `/api/tiktok/campaigns/${draft.id}` : "/api/tiktok/campaigns", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({ success: false }));
    setSaving(false);
    if (payload.success) await onSaved();
    else setError(payload.error ?? t("Could not save the campaign."));
  }

  return (
    <form onSubmit={save} className="mb-6 space-y-5 rounded border border-border p-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">{t("Campaign name")}</span>
        <input className={inputClass} value={draft.name} onChange={(e) => update({ name: e.target.value })} required maxLength={100} />
      </label>

      {!draft.id && accounts.length > 1 && (
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t("TikTok account")}</span>
          <select
            className={inputClass}
            value={draft.tiktokAccountId}
            onChange={(e) => update({ tiktokAccountId: e.target.value, videoId: null, videoCaption: null })}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("Which videos")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={draft.matchAnyVideo} onChange={() => update({ matchAnyVideo: true })} />
          {t("All videos")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={!draft.matchAnyVideo} onChange={() => update({ matchAnyVideo: false })} />
          {t("One video")}
        </label>
        {!draft.matchAnyVideo && (
          <select
            className={inputClass}
            value={draft.videoId ?? ""}
            onChange={(e) => {
              const video = videos?.find((v) => v.id === e.target.value);
              update({ videoId: e.target.value || null, videoCaption: video?.caption || null });
            }}
            required
          >
            <option value="">{videos ? t("Choose a video") : t("Loading videos...")}</option>
            {draft.videoId && !videos?.some((v) => v.id === draft.videoId) && (
              <option value={draft.videoId}>{draft.videoCaption || draft.videoId}</option>
            )}
            {videos?.map((video) => (
              <option key={video.id} value={video.id}>
                {(video.caption || video.id).slice(0, 80)}
                {video.createTime ? ` · ${new Date(video.createTime * 1000).toLocaleDateString(locale)}` : ""}
              </option>
            ))}
          </select>
        )}
        {videoError && <p className="text-xs text-error">{videoError}</p>}
      </fieldset>

      <div className="space-y-2">
        <span className="text-sm font-medium">{t("Keywords")}</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.matchAnyWord} onChange={(e) => update({ matchAnyWord: e.target.checked })} />
          {t("Reply to every comment (any word)")}
        </label>
        {!draft.matchAnyWord && (
          <>
            <KeywordInput keywords={draft.keywords} onChange={(keywords) => update({ keywords })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.wholeWordMatch} onChange={(e) => update({ wholeWordMatch: e.target.checked })} />
              {t("Whole word only")}
            </label>
          </>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">{t("Reply variations")}</span>
        <p className="text-xs text-muted">
          {t("One is picked at random for each reply. TikTok hides many near-identical replies as spam, so add a few different ones.")}
        </p>
        {draft.replyMessages.map((message, index) => {
          const length = tiktokReplyLength(message.trim());
          return (
            <div key={index} className="space-y-1">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={message}
                  onChange={(e) =>
                    update({ replyMessages: draft.replyMessages.map((m, i) => (i === index ? e.target.value : m)) })
                  }
                />
                {draft.replyMessages.length > 1 && (
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => update({ replyMessages: draft.replyMessages.filter((_, i) => i !== index) })}
                  >
                    {t("Remove")}
                  </button>
                )}
              </div>
              <p className={`text-xs ${length > TIKTOK_REPLY_MAX_LENGTH ? "text-error" : "text-muted"}`}>
                {length}/{TIKTOK_REPLY_MAX_LENGTH}
              </p>
            </div>
          );
        })}
        {draft.replyMessages.length < 10 && (
          <button
            type="button"
            className={smallButton}
            onClick={() => update({ replyMessages: [...draft.replyMessages, ""] })}
          >
            {t("+ Add another reply")}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => update({ isActive: e.target.checked })} />
        {t("Active")}
      </label>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || tooLong}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t("Saving…") : t("Save campaign")}
        </button>
        <button type="button" onClick={onCancel} className={smallButton}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
