-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN     "mediaId" TEXT;

-- AlterTable
ALTER TABLE "LinkClick" ADD COLUMN     "src" TEXT;

-- CreateIndex
CREATE INDEX "DmLog_automationId_mediaId_idx" ON "DmLog"("automationId", "mediaId");

-- CreateIndex
CREATE INDEX "LinkClick_src_idx" ON "LinkClick"("src");

