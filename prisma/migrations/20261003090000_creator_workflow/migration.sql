-- Additive migration: preserve every existing campaign's sending state.
ALTER TABLE "Automation" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "excludedKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "armedAt" TIMESTAMP(3), ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "Automation" SET "lifecycle" = CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'PAUSED' END;
UPDATE "Automation" SET "armedAt" = "createdAt" WHERE "pendingNextReel" AND "isActive";
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_lifecycle_check" CHECK ("lifecycle" IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'));
-- A unique next-reel index would fail on pre-existing overlapping campaigns.
-- Both writers serialize on an account advisory lock instead; no rows are
-- silently paused or rebound by this migration.
CREATE TABLE "WorkspaceAsset" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "data" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceAsset_workspaceId_kind_idx" ON "WorkspaceAsset"("workspaceId", "kind");
CREATE TABLE "CampaignRevision" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "automationId" TEXT NOT NULL,
  "actorId" TEXT, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignRevision_workspaceId_automationId_createdAt_idx" ON "CampaignRevision"("workspaceId", "automationId", "createdAt");
CREATE TABLE "LibraryDraftRequest" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "campaignId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryDraftRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LibraryDraftRequest_workspaceId_requestKey_key" ON "LibraryDraftRequest"("workspaceId", "requestKey");
