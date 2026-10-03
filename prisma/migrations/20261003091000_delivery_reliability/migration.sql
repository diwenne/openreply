CREATE TABLE "DeliveryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "automationId" TEXT NOT NULL,
  "instagramAccountId" TEXT, "stage" TEXT NOT NULL, "operationKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "recipientId" TEXT, "message" TEXT,
  "campaignVersion" INTEGER NOT NULL DEFAULT 1, "payload" JSONB, "attempts" INTEGER NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMP(3), "claimedAt" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryEvent_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeliveryEvent_operationKey_key" ON "DeliveryEvent"("operationKey");
CREATE INDEX "DeliveryEvent_workspaceId_createdAt_idx" ON "DeliveryEvent"("workspaceId", "createdAt");
CREATE INDEX "DeliveryEvent_automationId_stage_idx" ON "DeliveryEvent"("automationId", "stage");
CREATE INDEX "DeliveryEvent_stage_status_scheduledAt_idx" ON "DeliveryEvent"("stage", "status", "scheduledAt");
