-- CreateEnum
CREATE TYPE "OperationalEventSource" AS ENUM ('WORKER', 'TOKEN_REFRESH', 'HEALTH', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OperationalEventLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "source" "OperationalEventSource" NOT NULL,
    "level" "OperationalEventLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalEvent_workspaceId_idx" ON "OperationalEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "OperationalEvent_source_idx" ON "OperationalEvent"("source");

-- CreateIndex
CREATE INDEX "OperationalEvent_level_idx" ON "OperationalEvent"("level");

-- CreateIndex
CREATE INDEX "OperationalEvent_createdAt_idx" ON "OperationalEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
