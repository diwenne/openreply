"use client";

/**
 * Dashboard Home Page
 *
 * Overview cards, 7-day chart, and recent activity feed.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatCard from "@/components/stat-card";
import StatusBadge from "@/components/status-badge";
import {
  Rocket,
  PaperPlaneTilt,
  SkipForward,
  XCircle,
  CursorClick,
  Percent,
  ChartBar,
  MagnifyingGlass,
  Pulse,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";

// Section header + stat card icons share this muted treatment so they read as
// decoration, not as interactive elements.
const ICON_CLASS = "text-muted shrink-0";

// Recent Activity pager — this many rows shown before "Show more" is needed.
const ACTIVITY_PAGE_SIZE = 10;

interface DashboardStats {
  userName: string | null;
  contactsCount: number;
  totalAutomations: number;
  activeAutomations: number;
  dmsSentToday: number;
  dmsSentWeek: number;
  dmsSentMonth: number;
  dmsSkippedMonth: number;
  dmsFailedMonth: number;
  totalDMs: number;
  clicksThisMonth: number;
  totalClicks: number;
  ctrThisMonth: number;
  instagramAccounts: AccountOption[];
  selectedInstagramAccountId: string | null;
  topKeywords: { keyword: string; count: number }[];
  dailyDMs: { date: string; count: number }[];
  recentLogs: Array<{
    id: string;
    commenterName: string | null;
    commentText: string;
    status: string;
    createdAt: string;
    automation: { name: string };
    instagramAccount?: { username: string };
  }>;
}

export default function DashboardPage() {
  const { t, label } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  // Recent Activity pager — show ACTIVITY_PAGE_SIZE rows at a time.
  const [visibleActivityCount, setVisibleActivityCount] = useState(
    ACTIVITY_PAGE_SIZE
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }

    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setVisibleActivityCount(ACTIVITY_PAGE_SIZE);
    setSelectedAccountId(accountId);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel rounded p-5 h-32">
              <div className="w-10 h-10 rounded bg-surface-hover" />
              <div className="mt-4 h-6 w-16 bg-surface-hover rounded" />
              <div className="mt-2 h-4 w-24 bg-surface-hover/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxDM = Math.max(...(stats?.dailyDMs.map((d) => d.count) ?? [1]), 1);

  const connectedCount = stats?.instagramAccounts.length ?? 0;

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("Hello, {name}!", { name: stats?.userName ?? t("there") })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(connectedCount === 1 ? "{count} connected account" : "{count} connected accounts", { count: connectedCount })}
            {" · "}
            {t(stats?.contactsCount === 1 ? "{count} contact" : "{count} contacts", { count: stats?.contactsCount ?? 0 })}
            {" · "}
            <a href="/logs" className="text-accent hover:underline">
              {t("See activity")}
            </a>
          </p>
        </div>
        {stats && stats.instagramAccounts.length > 1 && (
          <AccountSelect
            accounts={stats.instagramAccounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          label={t("Active Campaigns")}
          value={stats?.activeAutomations ?? 0}
          icon={<Rocket size={16} weight="regular" className={ICON_CLASS} />}
        />
        <StatCard
          label={t("DMs Sent")}
          value={stats?.dmsSentMonth ?? 0}
          icon={<PaperPlaneTilt size={16} weight="regular" className={ICON_CLASS} />}
        />
        <StatCard
          label={t("Skipped")}
          value={stats?.dmsSkippedMonth ?? 0}
          icon={<SkipForward size={16} weight="regular" className={ICON_CLASS} />}
        />
        <StatCard
          label={t("Failed")}
          value={stats?.dmsFailedMonth ?? 0}
          icon={<XCircle size={16} weight="regular" className={ICON_CLASS} />}
        />
        <StatCard
          label={t("Clicks")}
          value={stats?.clicksThisMonth ?? 0}
          icon={<CursorClick size={16} weight="regular" className={ICON_CLASS} />}
        />
        <StatCard
          label={t("CTR")}
          value={`${stats?.ctrThisMonth ?? 0}%`}
          icon={<Percent size={16} weight="regular" className={ICON_CLASS} />}
        />
      </div>

      {/* Chart + Top Keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* 7-Day Chart */}
        <div className="lg:col-span-3 panel rounded p-4 sm:p-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-6">
            <ChartBar size={16} weight="regular" className={ICON_CLASS} />
            {t("DMs — Last 7 Days")}
          </h2>
          <div className="flex items-end gap-1.5 h-40 sm:gap-2">
            {stats?.dailyDMs.map((day) => (
              <div key={label(day.date)} className="min-w-0 flex-1 h-full flex flex-col items-center gap-2">
                <span className="text-xs text-muted font-medium">{day.count}</span>
                {/* A percentage height needs a parent with a definite height, so
                    the bar sits in a wrapper that fills the column's free space. */}
                <div className="w-full min-h-0 flex-1 flex items-end">
                  <div
                    className="w-full rounded-sm bg-accent min-h-[4px]"
                    style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
                  />
                </div>
                {/* Seven labels share a phone's width, so they must not wrap. */}
                <span className="w-full truncate text-center text-[10px] text-zinc-500">
                  {label(day.date)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Keywords */}
        <div className="lg:col-span-1 panel rounded p-4 sm:p-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-4">
            <MagnifyingGlass size={16} weight="regular" className={ICON_CLASS} />
            {t("Top Keywords")}
          </h2>
          <div className="space-y-3">
            {stats?.topKeywords.length === 0 && (
              <p className="text-sm text-muted py-8">{t("No keyword matches yet")}</p>
            )}
            {stats?.topKeywords.map((keyword) => (
              <div key={keyword.keyword} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">
                  {keyword.keyword}
                </span>
                <span className="text-xs text-muted">{keyword.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity — full-width card on its own row */}
      <div className="panel rounded p-4 sm:p-6">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-4">
          <Pulse size={16} weight="regular" className={ICON_CLASS} />
          {t("Recent Activity")}
        </h2>

        {stats?.recentLogs.length === 0 && (
          <p className="text-sm text-muted text-center py-8">{t("No activity yet")}</p>
        )}

        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
          {(stats?.recentLogs.slice(0, visibleActivityCount) ?? []).map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  @{log.commenterName ?? "unknown"}
                </p>
                <p className="text-xs text-muted truncate">
                  {log.instagramAccount
                    ? `@${log.instagramAccount.username} · `
                    : ""}
                  {log.commentText}
                </p>
              </div>
              <StatusBadge status={log.status} />
            </div>
          ))}
        </div>

        {stats && stats.recentLogs.length > visibleActivityCount && (
          <button
            type="button"
            onClick={() => setVisibleActivityCount((c) => c + ACTIVITY_PAGE_SIZE)}
            className="mt-4 w-full rounded border border-border py-2 text-sm text-foreground hover:bg-surface-hover"
          >
            <CaretDown size={14} weight="bold" className={ICON_CLASS} />
            {t("Show more")} ({stats.recentLogs.length - visibleActivityCount})
          </button>
        )}
        {stats && visibleActivityCount > ACTIVITY_PAGE_SIZE && (
          <button
            type="button"
            onClick={() => setVisibleActivityCount(ACTIVITY_PAGE_SIZE)}
            className="mt-2 w-full rounded py-2 text-sm text-muted hover:text-foreground"
          >
            <CaretUp size={14} weight="bold" className={ICON_CLASS} />
            {t("Show less")}
          </button>
        )}
      </div>
    </div>
  );
}
