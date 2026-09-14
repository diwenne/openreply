-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN "openingDmSentAt" TIMESTAMP(3);
ALTER TABLE "DmLog" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DmLog_openingDmSentAt_idx" ON "DmLog"("openingDmSentAt");
