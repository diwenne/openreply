-- AlterTable
ALTER TABLE "DmLog" ADD COLUMN     "publicReplyError" TEXT,
ADD COLUMN     "publicReplySentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProcessedComment" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedComment_commentId_key" ON "ProcessedComment"("commentId");

-- CreateIndex
CREATE INDEX "ProcessedComment_instagramAccountId_idx" ON "ProcessedComment"("instagramAccountId");
