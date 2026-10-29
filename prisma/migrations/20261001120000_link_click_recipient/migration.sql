-- Tracked links sent in a DM now carry a per-recipient token, so repeat taps by
-- one person count as one click. Older clicks have no token and are counted by
-- ipHash instead, so nothing needs backfilling.

-- AlterTable
ALTER TABLE "LinkClick" ADD COLUMN IF NOT EXISTS "recipientHash" TEXT;
