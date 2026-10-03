-- Prerequisites: creator workflow and durable delivery packages.
CREATE TABLE "IntegrationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "automationId" TEXT,
  "eventType" TEXT NOT NULL,
  "externalId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationEvent_workspaceId_externalId_key" ON "IntegrationEvent"("workspaceId", "externalId");
CREATE INDEX "IntegrationEvent_workspaceId_createdAt_idx" ON "IntegrationEvent"("workspaceId", "createdAt");
