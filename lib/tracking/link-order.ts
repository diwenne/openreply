import type { Prisma } from "@/app/generated/prisma/client";

/**
 * The order of a campaign's tracked links, which is the order of its DM
 * buttons: the first link is the primary button.
 *
 * `position` decides it. `createdAt` and `id` only break ties between links
 * that share a position, which happens for links an older build wrote while a
 * deploy was rolling out. Without them, Postgres is free to return tied rows
 * in a different order on every read.
 */
export const TRACKED_LINK_ORDER = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.TrackedLinkOrderByWithRelationInput[];
