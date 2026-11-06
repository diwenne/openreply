"use client";

/**
 * Leads Page
 *
 * Everyone who received a campaign DM, tapped a button, or messaged in, with
 * the time left in Meta's 24-hour messaging window.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState, useCallback } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import type { StaticMessageKey } from "@/lib/i18n";

interface Lead {
  id: string;
  igsid: string;
  username: string | null;
  firstSeenAt: string;
  lastInboundAt: string | null;
  lastRepliedAt: string | null;
  windowClosesAt: string | null;
  sourceAutomation: { id: string; name: string } | null;
  instagramAccount: { username: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const FILTERS: { value: string; label: StaticMessageKey }[] = [
  { value: "all", label: "All" },
  { value: "window", label: "Window open" },
  { value: "replied", label: "Replied" },
  { value: "not_replied", label: "Not replied" },
];

export default function LeadsPage() {
  const { t, locale } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [page, setPage] = useState(1);
  // Captured per fetch so the "time left" column is consistent within a render.
  const [now, setNow] = useState(() => Date.now());

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filter !== "all") params.set("filter", filter);
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.data.leads);
        setPagination(data.data.pagination);
        setNow(Date.now());
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filter, selectedAccountId]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setAccounts(payload.data.instagramAccounts ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLeads();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchLeads]);

  function handleFilterChange(value: string) {
    setLoading(true);
    setFilter(value);
    setPage(1);
  }

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
    setPage(1);
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function windowLabel(lead: Lead) {
    if (!lead.windowClosesAt) return t("Not opened");
    const msLeft = new Date(lead.windowClosesAt).getTime() - now;
    if (msLeft <= 0) return t("Closed");
    const hours = Math.floor(msLeft / 3_600_000);
    return hours >= 1
      ? t("{hours}h left", { hours })
      : t("{minutes}m left", { minutes: Math.max(1, Math.floor(msLeft / 60_000)) });
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => handleFilterChange(item.value)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
                  filter === item.value
                    ? "bg-accent/15 text-accent border border-accent/20"
                    : "bg-surface text-muted border border-border hover:border-border-hover hover:text-foreground"
                }
              `}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Table */}
      <div className="panel rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Lead")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Campaign")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Last reply")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("Messaging window")}</th>
                <th className="px-4 py-4 text-xs font-semibold text-muted uppercase tracking-wider sm:px-6">{t("First seen")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-4 py-4 sm:px-6">
                        <div className="h-4 bg-surface-hover rounded" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted sm:px-6">
                    {t("No leads yet. People appear here once a campaign sends them a DM or they message your account.")}
                  </td>
                </tr>
              )}
              {!loading &&
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-4 py-4 sm:px-6">
                      <span className="font-medium text-foreground">
                        @{lead.username ?? lead.igsid.slice(0, 8)}
                      </span>
                      {accounts.length > 1 && (
                        <span className="block text-xs text-muted">
                          @{lead.instagramAccount.username}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="text-muted">
                        {lead.sourceAutomation?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted whitespace-nowrap sm:px-6">
                      {lead.lastRepliedAt ? formatDate(lead.lastRepliedAt) : t("No reply yet")}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap sm:px-6">
                      <span className="text-muted">{windowLabel(lead)}</span>
                    </td>
                    <td className="px-4 py-4 text-muted whitespace-nowrap sm:px-6">
                      {formatDate(lead.firstSeenAt)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-t border-border sm:px-6">
            <p className="text-xs text-muted">
              {t("Showing {start}–{end} of {total}", {
                start: (pagination.page - 1) * pagination.limit + 1,
                end: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => {
                  setLoading(true);
                  setPage(page - 1);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border hover:text-foreground hover:border-border-hover transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                {t("Previous")}
              </button>
              <span className="text-xs text-muted px-2">
                {page} / {pagination.totalPages}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => {
                  setLoading(true);
                  setPage(page + 1);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted border border-border hover:text-foreground hover:border-border-hover transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                {t("Next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
