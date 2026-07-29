-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "matchStoryReplies" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN     "storyId" TEXT;
