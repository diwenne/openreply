"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { ReactNode } from "react";


/**
 * Stat Card
 *
 * Metric panel with label, value, and optional trend.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  /** Small Phosphor icon rendered before the metric label. */
  icon?: ReactNode;
}

export default function StatCard({ label, value, trend, trendUp, icon }: StatCardProps) {
  const { t } = useI18n();
  return (
    <div className="panel rounded p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}
