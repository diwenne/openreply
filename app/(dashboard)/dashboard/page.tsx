"use client";

/**
 * Dashboard Home Page
 *
 * Overview cards, 7-day chart, and recent activity feed.
 */

import { useEffect, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatCard from "@/components/stat-card";
import StatusBadge from "@/components/status-badge";

interface DashboardStats {
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");

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
    setSelectedAccountId(accountId);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel rounded p-5 h-32">
              <div className="w-10 h-10 rounded bg-zinc-800" />
              <div className="mt-4 h-6 w-16 bg-zinc-800 rounded" />
              <div className="mt-2 h-4 w-24 bg-zinc-800/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxDM = Math.max(...(stats?.dailyDMs.map((d) => d.count) ?? [1]), 1);

  return (
    <div className="space-y-8">
      {stats && stats.instagramAccounts.length > 1 && (
        <div className="flex justify-end">
          <AccountSelect
            accounts={stats.instagramAccounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Active Campaigns"
          value={stats?.activeAutomations ?? 0}
        />
        <StatCard label="DMs Sent" value={stats?.dmsSentMonth ?? 0} />
        <StatCard label="Skipped" value={stats?.dmsSkippedMonth ?? 0} />
        <StatCard label="Failed" value={stats?.dmsFailedMonth ?? 0} />
        <StatCard label="Clicks" value={stats?.clicksThisMonth ?? 0} />
        <StatCard label="CTR" value={`${stats?.ctrThisMonth ?? 0}%`} />
      </div>

      {/* Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        {/* 7-Day Chart */}
        <div className="lg:col-span-3 panel rounded p-6">
          <h2 className="text-sm font-semibold text-foreground mb-6">DMs — Last 7 Days</h2>
          <div className="flex items-end gap-2 h-40">
            {stats?.dailyDMs.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-muted font-medium">{day.count}</span>
                <div
                  className="w-full rounded-sm bg-accent min-h-[4px]"
                  style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
                />
                <span className="text-[10px] text-zinc-500">{day.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Keywords */}
        <div className="lg:col-span-1 panel rounded p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Top Keywords</h2>
          <div className="space-y-3">
            {stats?.topKeywords.length === 0 && (
              <p className="text-sm text-muted py-8">No keyword matches yet</p>
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

        {/* Recent Activity */}
        <div className="lg:col-span-2 panel rounded p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {stats?.recentLogs.length === 0 && (
              <p className="text-sm text-muted text-center py-8">No activity yet</p>
            )}
            {stats?.recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
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
        </div>
      </div>
    </div>
  );
}
