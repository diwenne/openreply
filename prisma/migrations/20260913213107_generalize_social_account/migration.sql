-- Generalize InstagramAccount -> SocialAccount (adds Facebook Page support).
-- Every rename below preserves existing rows: no DROP/CREATE on data-bearing
-- objects. Existing rows get platform='INSTAGRAM' by default (they all were).

-- 1. New enum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

-- 2. Rename the table itself
ALTER TABLE "InstagramAccount" RENAME TO "SocialAccount";
ALTER TABLE "SocialAccount" RENAME CONSTRAINT "InstagramAccount_pkey" TO "SocialAccount_pkey";
ALTER TABLE "SocialAccount" RENAME CONSTRAINT "InstagramAccount_workspaceId_fkey" TO "SocialAccount_workspaceId_fkey";

-- 3. Column changes on SocialAccount
ALTER TABLE "SocialAccount" RENAME COLUMN "instagramId" TO "externalId";
ALTER TABLE "SocialAccount" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "SocialAccount" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'INSTAGRAM';

-- 4. Indexes on SocialAccount
ALTER INDEX "InstagramAccount_instagramId_key" RENAME TO "SocialAccount_externalId_key";
ALTER INDEX "InstagramAccount_workspaceId_idx" RENAME TO "SocialAccount_workspaceId_idx";
CREATE INDEX "SocialAccount_platform_idx" ON "SocialAccount"("platform");

-- 5. Automation FK
ALTER TABLE "Automation" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "Automation" RENAME CONSTRAINT "Automation_instagramAccountId_fkey" TO "Automation_socialAccountId_fkey";
ALTER INDEX "Automation_instagramAccountId_idx" RENAME TO "Automation_socialAccountId_idx";

-- 6. DmLog FK
ALTER TABLE "DmLog" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "DmLog" RENAME CONSTRAINT "DmLog_instagramAccountId_fkey" TO "DmLog_socialAccountId_fkey";
ALTER INDEX "DmLog_instagramAccountId_idx" RENAME TO "DmLog_socialAccountId_idx";

-- 7. LinkClick FK
ALTER TABLE "LinkClick" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "LinkClick" RENAME CONSTRAINT "LinkClick_instagramAccountId_fkey" TO "LinkClick_socialAccountId_fkey";
ALTER INDEX "LinkClick_instagramAccountId_idx" RENAME TO "LinkClick_socialAccountId_idx";

-- 8. ProcessedComment (plain column, no FK constraint)
ALTER TABLE "ProcessedComment" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER INDEX "ProcessedComment_instagramAccountId_idx" RENAME TO "ProcessedComment_socialAccountId_idx";
