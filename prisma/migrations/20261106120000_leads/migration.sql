-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "username" TEXT,
    "sourceAutomationId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastRepliedAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastFollowUpSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_workspaceId_lastInboundAt_idx" ON "Lead"("workspaceId", "lastInboundAt");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_updatedAt_idx" ON "Lead"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Lead_sourceAutomationId_idx" ON "Lead"("sourceAutomationId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_instagramAccountId_igsid_key" ON "Lead"("instagramAccountId", "igsid");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceAutomationId_fkey" FOREIGN KEY ("sourceAutomationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

