-- AlterTable
ALTER TABLE "Automation" ADD COLUMN "reportShareSlug" TEXT;
ALTER TABLE "Automation" ADD COLUMN "reportShareEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Automation_reportShareSlug_key" ON "Automation"("reportShareSlug");
