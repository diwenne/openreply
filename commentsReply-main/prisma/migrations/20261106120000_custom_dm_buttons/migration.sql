-- Custom DM buttons per campaign stage. Existing campaigns keep NULL and with
-- it their original fixed-button behavior, so nothing needs backfilling.

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "dmButtons" JSONB;
