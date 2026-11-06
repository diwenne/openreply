CREATE TYPE "InstagramProvider" AS ENUM ('META', 'ZERNIO');
ALTER TABLE "InstagramAccount" ADD COLUMN "provider" "InstagramProvider" NOT NULL DEFAULT 'META', ADD COLUMN "zernioAccountId" TEXT;
CREATE TABLE "ZernioConnection" (
  "workspaceId" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "profileId" TEXT,
  "webhookId" TEXT,
  "webhookSecret" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZernioConnection_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "ZernioConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
