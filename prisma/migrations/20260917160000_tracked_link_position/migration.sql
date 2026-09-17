-- A campaign's DM button order used to be inferred from TrackedLink.createdAt.
-- Links saved in the same request share one createdAt, and Postgres returns
-- tied rows in no fixed order, so buttons could swap, and saving a campaign
-- could write its second link over its first. The order is now stored.
--
-- Prisma applies a migration one statement at a time, not in a transaction,
-- so both statements are safe to run again: if the backfill fails, the error
-- Prisma prints is the real one, and after `prisma migrate resolve
-- --rolled-back 20260917160000_tracked_link_position` the next deploy re-runs
-- this file from the top. Until the backfill lands, reads stay correct, since
-- every link reads as position 0 and ties fall back to createdAt, then id.

-- AlterTable
ALTER TABLE "TrackedLink" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- Number every existing link in the order the app has always intended: oldest
-- first, and for links created together, by id, since ids generated in one
-- request increase in the order the links were written. COLLATE "C" compares
-- ids byte by byte whatever the database's default collation is. Only rows
-- whose position changes are written, and updatedAt is left alone because the
-- links themselves did not change.
UPDATE "TrackedLink" AS link
SET "position" = ordered."position"
FROM (
  SELECT
    "id",
    (ROW_NUMBER() OVER (
      PARTITION BY "automationId"
      ORDER BY "createdAt" ASC, "id" COLLATE "C" ASC
    ) - 1)::INTEGER AS "position"
  FROM "TrackedLink"
) AS ordered
WHERE link."id" = ordered."id"
  AND link."position" <> ordered."position";
