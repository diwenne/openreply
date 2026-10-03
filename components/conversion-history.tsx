"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

type Conversion = { eventType: string; count: number };
export default function ConversionHistory({ campaignId }: { campaignId: string }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/history?id=${encodeURIComponent(campaignId)}`, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load conversion history");
      if (!signal?.aborted) setEvents(payload.data.conversions);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load conversion history");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [campaignId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  return <section className="space-y-3 rounded border border-border p-4">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t("Reported conversions")}</h3><button type="button" disabled={loading} onClick={() => void load()}>{loading ? t("Loading…") : t("Refresh")}</button></div>
    <p className="text-xs text-muted">{t("Externally reported events only. Link clicks do not prove downloads or qualified inquiries.")}</p>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    <div className="flex flex-wrap gap-3">{events.map(event => <p key={event.eventType} className="text-sm"><span className="font-mono text-xs">{event.eventType.replace("conversion.", "")}</span>: {event.count}</p>)}</div>
    {!loading && !events.length && <p className="text-xs text-muted">{t("No conversion events reported yet.")}</p>}
  </section>;
}
