-- Release-to-campaign pipeline: deterministic post binding + sync bookkeeping.
ALTER TABLE "Automation" ADD COLUMN "catnoTag" TEXT;

CREATE TABLE "ReleaseSyncEvent" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "automationId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseSyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReleaseSyncEvent_sku_eventType_key" ON "ReleaseSyncEvent"("sku", "eventType");

CREATE TABLE "ReleaseProductState" (
    "sku" TEXT NOT NULL,
    "lastStatus" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseProductState_pkey" PRIMARY KEY ("sku")
);
