-- CreateEnum
CREATE TYPE "TikTokReplyStatus" AS ENUM ('PENDING', 'REPLIED', 'SKIPPED', 'FAILED', 'UNCONFIRMED');

-- CreateTable
CREATE TABLE "TikTokAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tiktokAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "matchAnyWord" BOOLEAN NOT NULL DEFAULT false,
    "wholeWordMatch" BOOLEAN NOT NULL DEFAULT true,
    "matchAnyVideo" BOOLEAN NOT NULL DEFAULT false,
    "videoId" TEXT,
    "videoCaption" TEXT,
    "replyMessages" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokReplyLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tiktokAccountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "commentId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "commentText" TEXT NOT NULL,
    "commenterName" TEXT,
    "source" TEXT,
    "status" "TikTokReplyStatus" NOT NULL DEFAULT 'PENDING',
    "replyText" TEXT,
    "replyCommentId" TEXT,
    "errorMessage" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokReplyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokAccount_openId_key" ON "TikTokAccount"("openId");

-- CreateIndex
CREATE INDEX "TikTokAccount_workspaceId_idx" ON "TikTokAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "TikTokCampaign_workspaceId_idx" ON "TikTokCampaign"("workspaceId");

-- CreateIndex
CREATE INDEX "TikTokCampaign_tiktokAccountId_idx" ON "TikTokCampaign"("tiktokAccountId");

-- CreateIndex
CREATE INDEX "TikTokReplyLog_workspaceId_createdAt_idx" ON "TikTokReplyLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TikTokReplyLog_campaignId_idx" ON "TikTokReplyLog"("campaignId");

-- CreateIndex
CREATE INDEX "TikTokReplyLog_replyCommentId_idx" ON "TikTokReplyLog"("replyCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokReplyLog_tiktokAccountId_commentId_key" ON "TikTokReplyLog"("tiktokAccountId", "commentId");

-- AddForeignKey
ALTER TABLE "TikTokAccount" ADD CONSTRAINT "TikTokAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokCampaign" ADD CONSTRAINT "TikTokCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokCampaign" ADD CONSTRAINT "TikTokCampaign_tiktokAccountId_fkey" FOREIGN KEY ("tiktokAccountId") REFERENCES "TikTokAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokReplyLog" ADD CONSTRAINT "TikTokReplyLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokReplyLog" ADD CONSTRAINT "TikTokReplyLog_tiktokAccountId_fkey" FOREIGN KEY ("tiktokAccountId") REFERENCES "TikTokAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokReplyLog" ADD CONSTRAINT "TikTokReplyLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "TikTokCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

