"use client";

/**
 * Followers Over Time
 *
 * Single-series line chart over stored daily snapshots. Deliberately separate
 * from the Overview stat tiles: those sum the selected posts, while this is an
 * account-level total that ignores the post range.
 *
 * History depth is limited by what has been snapshotted — Instagram only serves
 * ~30 days of account insights, so earlier days exist only if this instance was
 * already running then.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FollowerChartPoint {
  date: string;
  followers: number;
  delta: number | null;
}

// Colors read against the light chart surface (#ffffff): the accent line clears
// 3:1 contrast and grid/axis text match the muted/border tokens. See globals.css.
const SERIES_COLOR = "#f97316";
const GRID_COLOR = "#e4e4e7";
const AXIS_TEXT = "#71717a";

function formatCompact(n: number, locale: Locale): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(locale);
}

function formatDay(iso: string, locale: Locale): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatSigned(n: number, locale: Locale): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString(locale)}`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: FollowerChartPoint }>;
}) {
  const { t, locale } = useI18n();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="text-muted">{formatDay(point.date, locale)}</p>
      <p className="mt-1 font-semibold text-foreground">
        {point.followers.toLocaleString(locale)} {t("followers")}
      </p>
      {point.delta !== null && point.delta !== 0 && (
        <p className={point.delta > 0 ? "text-success" : "text-error"}>
          {formatSigned(point.delta, locale)} {t("that day")}
        </p>
      )}
    </div>
  );
}

export default function FollowerChart({
  data,
  followers,
}: {
  data: FollowerChartPoint[];
  followers: number | null;
}) {
  const { t, locale } = useI18n();
  const [showTable, setShowTable] = useState(false);

  const current = followers ?? data.at(-1)?.followers ?? null;

  // Net change across the whole visible window, shown once in the header rather
  // than labelling every point.
  const net =
    data.length > 1 ? data[data.length - 1].followers - data[0].followers : null;

  return (
    <div className="panel rounded p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t("Followers over time")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {current === null
              ? t("Follower count unavailable")
              : t("{count} now", { count: current.toLocaleString(locale) })}
            {net !== null && (
              <>
                {" · "}
                <span className={net >= 0 ? "text-success" : "text-error"}>
                  {formatSigned(net, locale)}
                </span>{" "}
                {t("over {count} days", { count: data.length })}
              </>
            )}
          </p>
        </div>
        {data.length > 1 && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
          >
            {showTable ? t("Show chart") : t("Show table")}
          </button>
        )}
      </div>

      {data.length < 2 ? (
        <div className="mt-6 rounded border border-border bg-surface/60 p-6 text-center">
          <p className="text-sm text-foreground">{t("Collecting follower history")}</p>
          <p className="mt-1 text-sm text-muted">
            {data.length === 0
              ? t("No snapshots recorded yet.")
              : t("One day recorded so far.")}{" "}
            {t("A point is added daily — the chart appears once there are at least two.")}
          </p>
        </div>
      ) : showTable ? (
        <div className="mt-4 max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-4 font-medium">{t("Date")}</th>
                <th className="py-2 px-3 font-medium text-right">{t("Followers")}</th>
                <th className="py-2 pl-3 font-medium text-right">{t("Change")}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((p) => (
                <tr key={p.date} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-foreground">
                    {formatDay(p.date, locale)}
                  </td>
                  <td className="py-2 px-3 text-right text-muted">
                    {p.followers.toLocaleString(locale)}
                  </td>
                  <td className="py-2 pl-3 text-right text-muted">
                    {p.delta === null ? "—" : formatSigned(p.delta, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={GRID_COLOR}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatDay(value, locale)}
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID_COLOR}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(value) => formatCompact(value, locale)}
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID_COLOR}
                tickLine={false}
                width={52}
                // Followers rarely start near zero, so a zero baseline would
                // flatten the line into a straight edge.
                domain={["dataMin - 5", "dataMax + 5"]}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="followers"
                stroke={SERIES_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "#ffffff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
