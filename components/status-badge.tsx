"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
/**
 * Status label for DM status. Plain text; color carries the state.
 */

const statusConfig: Record<string, { text: string; label: StaticMessageKey }> = {
  SENT: { text: "text-success", label: "Sent" },
  FAILED: { text: "text-error", label: "Failed" },
  PENDING: { text: "text-warning", label: "Pending" },
  SKIPPED_DEDUP: { text: "text-muted", label: "Dedup" },
  SKIPPED_RATE_LIMIT: { text: "text-warning", label: "Rate limited" },
  SKIPPED_PLAN_LIMIT: { text: "text-warning", label: "Skipped" },
  SKIPPED_NO_MATCH: { text: "text-muted", label: "No match" },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status] ?? statusConfig.PENDING;

  return (
    <span className={`shrink-0 whitespace-nowrap text-sm ${config.text}`}>
      {t(config.label)}
    </span>
  );
}
