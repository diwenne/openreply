"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { StaticMessageKey } from "@/lib/i18n";

type Delivery = { id: string; stage: string; status: string; campaignVersion: number; message: string | null; error: string | null; attempts: number; scheduledAt: string | null; claimedAt: string | null; sentAt: string | null; createdAt: string; updatedAt: string };
const stages: Record<string, StaticMessageKey> = {
  TRIGGER: "Trigger selection", PUBLIC_REPLY: "Public reply", OPENING_DM: "Opening DM",
  FOLLOW_PROMPT: "Follow prompt", FOLLOW_ACK: "Follow check acknowledgement", REVEAL: "Delivery DM",
  DELIVERY_DM: "Delivery DM", FOLLOW_UP: "Follow-up",
};
const statuses: Record<string, StaticMessageKey> = {
  SELECTED: "Selected, not sent", PENDING: "Scheduled", CLAIMED: "Claimed, outcome pending",
  SENT: "Send confirmed", FAILED: "Confirmed failure", UNCONFIRMED: "Delivery unconfirmed", SKIPPED: "Skipped",
};
function time(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export default function DeliveryHistory({ campaignId }: { campaignId: string }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/history?id=${encodeURIComponent(campaignId)}`, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load delivery history");
      if (!signal?.aborted) setEvents(payload.data.delivery);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load delivery history");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [campaignId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("Delivery stages")}</h3><button type="button" onClick={() => void load()} disabled={loading} className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50">{loading ? t("Loading…") : t("Refresh")}</button></div>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    <p className="rounded border border-warning/30 bg-warning/5 p-3 text-xs text-muted">{t("Claimed or unconfirmed messages may already have been delivered. Check the inbox before retrying. Follow-ups retain their saved content and campaign version.")}</p>
    <p className="text-xs text-muted">{t("The last 100 delivery events are shown. Earlier deliveries are not reconstructed.")}</p>
    {events.map(event => <details key={event.id} className="rounded border border-border p-3">
      <summary className="cursor-pointer text-sm">{stages[event.stage] ? t(stages[event.stage]) : event.stage} · {statuses[event.status] ? t(statuses[event.status]) : event.status} · v{event.campaignVersion}<span className="block text-xs text-muted">{time(event.createdAt)}</span></summary>
      <div className="mt-3 space-y-2 text-xs text-muted">
        <p>{t("Scheduled")}: {time(event.scheduledAt)} · {t("Claimed")}: {time(event.claimedAt)} · {t("Send confirmed")}: {time(event.sentAt)}</p>
        <p>{t("Attempts")}: {event.attempts} · {t("Last updated")}: {time(event.updatedAt)}</p>
        {event.message && <div><p>{/\{username\}|\{link\}/i.test(event.message) ? t("Saved message template") : t("Saved message content")}</p><p className="whitespace-pre-wrap rounded bg-surface p-2 text-foreground">{event.message}</p></div>}
        {event.error && <p className="break-words text-error">{event.error}</p>}
      </div>
    </details>)}
    {!loading && !events.length && <p className="text-xs text-muted">{t("No delivery stages recorded yet.")}</p>}
  </section>;
}
