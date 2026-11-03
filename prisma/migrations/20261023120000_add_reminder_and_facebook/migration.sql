-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'INSTAGRAM',
ADD COLUMN     "pageId" TEXT;

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderDelayMinutes" INTEGER,
ADD COLUMN     "reminderMessage" TEXT;

-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderError" TEXT,
ADD COLUMN     "reminderSkippedReason" TEXT;

-- AlterTable
ALTER TABLE "LinkClick" ADD COLUMN     "dmLogId" TEXT;

-- CreateIndex
CREATE INDEX "LinkClick_dmLogId_idx" ON "LinkClick"("dmLogId");
