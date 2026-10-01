const SKIPPED_PREFIX = "SKIPPED_";

export interface StatusCountRow {
  status: string;
  _count: number | { status?: number; _all?: number };
}

export interface KeywordCountRow {
  matchedKeyword: string | null;
  _count: number | { matchedKeyword?: number; _all?: number };
}

export interface ClickRow {
  id: string;
  automationId: string;
  recipientHash: string | null;
  ipHash: string | null;
}

/** The LinkClick fields the unique-click helpers need, for a Prisma `select`. */
export const CLICK_ROW_SELECT = {
  id: true,
  automationId: true,
  recipientHash: true,
  ipHash: true,
} as const;

function getCount(value: StatusCountRow["_count"] | KeywordCountRow["_count"]) {
  if (typeof value === "number") return value;
  if ("status" in value && typeof value.status === "number") {
    return value.status;
  }
  if ("matchedKeyword" in value && typeof value.matchedKeyword === "number") {
    return value.matchedKeyword;
  }
  return value._all ?? 0;
}

export function calculateCtr(clicks: number, sent: number) {
  if (sent <= 0) return 0;
  // Clicks are unique per recipient, but IP-counted clicks (older links, links
  // opened from a public reply or forwarded) can still exceed sends — cap it so
  // CTR stays sane.
  return Math.min(100, Number(((clicks / sent) * 100).toFixed(1)));
}

// Who a click belongs to, so each person counts once per campaign: the
// recipient token when the link carried one, else the IP hash, else the click
// itself.
function clickVisitorKey(row: ClickRow) {
  const visitor = row.recipientHash
    ? `r:${row.recipientHash}`
    : row.ipHash
      ? `ip:${row.ipHash}`
      : `click:${row.id}`;
  return `${row.automationId}:${visitor}`;
}

export function countUniqueClicks(rows: ClickRow[]) {
  return new Set(rows.map(clickVisitorKey)).size;
}

/** Unique clicks per group, e.g. per campaign or per tracked link. */
export function countUniqueClicksBy<T extends ClickRow>(
  rows: T[],
  groupOf: (row: T) => string
) {
  const visitorsByGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const group = groupOf(row);
    const visitors = visitorsByGroup.get(group) ?? new Set<string>();
    visitors.add(clickVisitorKey(row));
    visitorsByGroup.set(group, visitors);
  }
  return new Map(
    [...visitorsByGroup].map(([group, visitors]) => [group, visitors.size])
  );
}

export function summarizeDmStatuses(rows: StatusCountRow[]) {
  return rows.reduce(
    (summary, row) => {
      const count = getCount(row._count);
      if (row.status === "SENT") summary.sent += count;
      if (row.status === "FAILED") summary.failed += count;
      if (row.status.startsWith(SKIPPED_PREFIX)) summary.skipped += count;
      return summary;
    },
    { sent: 0, skipped: 0, failed: 0 }
  );
}

export function normalizeTopKeywords(rows: KeywordCountRow[], limit = 5) {
  return rows
    .filter((row) => row.matchedKeyword)
    .map((row) => ({
      keyword: row.matchedKeyword as string,
      count: getCount(row._count),
    }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}
