"use client";

import { useEffect, useState } from "react";
import StatusBadge from "@/components/status-badge";

interface DiagnosticsData {
  queueCounts: Record<string, number>;
  workerHealth: {
    healthy: boolean;
    ageMs: number | null;
    heartbeat: {
      checkedAt: string;
      hostname?: string;
      pid: number;
      startedAt?: string;
    } | null;
  };
  workerAlerts: Array<{
    level: string;
    message: string;
    jobId?: string;
    commentId?: string;
    createdAt: string;
  }>;
  webhookFailures: Array<{
    id: string;
    object: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  billingEvents: Array<{
    id: string;
    stripeEventId: string;
    type: string;
    processedAt: string;
  }>;
  dmFailures: Array<{
    id: string;
    status: string;
    commentId: string;
    commentText: string;
    errorMessage: string | null;
    updatedAt: string;
    automation: { name: string };
  }>;
  tokenRefreshFailures: Array<{
    id: string;
    message: string;
    createdAt: string;
  }>;
  operationalEvents: Array<{
    id: string;
    source: string;
    level: string;
    message: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-5 text-center text-sm text-muted">{label}</p>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshDiagnostics() {
    setLoading(true);
    const response = await fetch("/api/admin/diagnostics");
    const payload = await response.json();
    if (payload.success) {
      setData(payload.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialDiagnostics() {
      const response = await fetch("/api/admin/diagnostics");
      const payload = await response.json();
      if (active && payload.success) {
        setData(payload.data);
      }
      if (active) {
        setLoading(false);
      }
    }

    void loadInitialDiagnostics();

    return () => {
      active = false;
    };
  }, []);

  if (loading && !data) {
    return <div className="glass rounded-2xl p-8 h-64 animate-pulse" />;
  }

  const workerAgeSeconds =
    data?.workerHealth.ageMs == null
      ? null
      : Math.round(data.workerHealth.ageMs / 1000);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Production Diagnostics
          </h1>
          <p className="mt-1 text-sm text-muted">
            Health, queues, webhook failures, billing events, and worker alerts.
          </p>
        </div>
        <button
          onClick={() => void refreshDiagnostics()}
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border-hover"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase text-muted">
            Worker health
          </p>
          <p
            className={`mt-3 text-2xl font-bold ${
              data?.workerHealth.healthy ? "text-success" : "text-warning"
            }`}
          >
            {data?.workerHealth.healthy ? "Healthy" : "Needs attention"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {workerAgeSeconds == null
              ? "No heartbeat found"
              : `Last heartbeat ${workerAgeSeconds}s ago`}
          </p>
        </div>
        {["waiting", "active", "delayed", "failed"].map((key) => (
          <div key={key} className="glass rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase text-muted">
              Queue {key}
            </p>
            <p className="mt-3 text-2xl font-bold text-foreground">
              {data?.queueCounts[key] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <Section title="Recent Worker Alerts">
        {data?.workerAlerts.length ? (
          <div className="space-y-3">
            {data.workerAlerts.map((alert) => (
              <div
                key={`${alert.createdAt}-${alert.jobId ?? alert.message}`}
                className="rounded-xl border border-border bg-surface/50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {alert.message}
                  </p>
                  <span className="rounded-full bg-error/10 px-2 py-1 text-xs font-semibold text-error">
                    {alert.level}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {formatDate(alert.createdAt)}
                  {alert.commentId ? ` · ${alert.commentId}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No worker alerts recorded." />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="DM Failures And Skips">
          {data?.dmFailures.length ? (
            <div className="space-y-3">
              {data.dmFailures.map((item) => (
                <div key={item.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.automation.name}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {item.commentText}
                  </p>
                  {item.errorMessage && (
                    <p className="mt-1 text-xs text-error">{item.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No DM failures or skips." />
          )}
        </Section>

        <Section title="Webhook Failures">
          {data?.webhookFailures.length ? (
            <div className="space-y-3">
              {data.webhookFailures.map((event) => (
                <div key={event.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold text-foreground">
                    {event.object ?? "Instagram webhook"}
                  </p>
                  <p className="mt-1 text-xs text-error">
                    {event.errorMessage ?? "Unknown error"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No failed webhook events." />
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Token Refresh Failures">
          {data?.tokenRefreshFailures.length ? (
            <div className="space-y-3">
              {data.tokenRefreshFailures.map((event) => (
                <div key={event.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold text-foreground">
                    {event.message}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No token refresh failures." />
          )}
        </Section>

        <Section title="Billing Events">
          {data?.billingEvents.length ? (
            <div className="space-y-3">
              {data.billingEvents.map((event) => (
                <div key={event.id} className="border-b border-border pb-3 last:border-0">
                  <p className="text-sm font-semibold text-foreground">
                    {event.type}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {event.stripeEventId} · {formatDate(event.processedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No billing events yet." />
          )}
        </Section>
      </div>

      <Section title="Operational Event Timeline">
        {data?.operationalEvents.length ? (
          <div className="space-y-3">
            {data.operationalEvents.map((event) => (
              <div key={event.id} className="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[140px_1fr_auto]">
                <p className="text-xs font-semibold text-muted">{event.source}</p>
                <p className="text-sm text-foreground">{event.message}</p>
                <p className="text-xs text-muted">{formatDate(event.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No operational events recorded." />
        )}
      </Section>
    </div>
  );
}
