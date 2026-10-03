"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import DeliveryHistory from "@/components/delivery-history";

type Revision = { id: string; actorId: string | null; createdAt: string; snapshot: Record<string, unknown> };
export default function CampaignHistory({ campaignId }: { campaignId: string }) {
  const { t } = useI18n();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/automations/history?id=${encodeURIComponent(campaignId)}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load history");
      if (!signal?.aborted) setRevisions(result.data);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load history");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [campaignId]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  return <section className="space-y-4">
    <div className="flex justify-between"><h2>{t("Saved campaign versions")}</h2><button disabled={loading} onClick={() => void load()}>{loading ? t("Loading…") : t("Refresh")}</button></div>
    {error && <p role="alert">{error}</p>}
    <DeliveryHistory campaignId={campaignId} />
    <p className="text-xs text-muted">{t("Snapshots retain the settings and links at the time of each save. Older changes are not reconstructed.")}</p>
    {revisions.map(revision => <details key={revision.id} className="rounded border border-border p-3">
      <summary>v{String(revision.snapshot.version ?? "?")} · {String(revision.snapshot.lifecycle ?? "—")} · {new Date(revision.createdAt).toLocaleString()}</summary>
      <p className="text-xs text-muted">{revision.actorId?.startsWith("system:") ? t("System") : t("Team member")}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(revision.snapshot, null, 2)}</pre>
    </details>)}
    {!loading && !revisions.length && <p>{t("No revisions recorded yet.")}</p>}
  </section>;
}
