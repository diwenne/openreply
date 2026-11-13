-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('COMMENT', 'STORY_REPLY', 'DM_KEYWORD');

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "triggerType" "TriggerType" NOT NULL DEFAULT 'COMMENT',
ADD COLUMN     "welcomeCooldownDays" INTEGER;

-- CreateIndex
CREATE INDEX "Automation_instagramAccountId_triggerType_isActive_idx" ON "Automation"("instagramAccountId", "triggerType", "isActive");
