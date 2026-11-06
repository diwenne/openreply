-- CreateTable
CREATE TABLE "FollowerSnapshot" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followersCount" INTEGER NOT NULL,
    "backfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowerSnapshot_instagramAccountId_date_key" ON "FollowerSnapshot"("instagramAccountId", "date");

-- CreateIndex
CREATE INDEX "FollowerSnapshot_instagramAccountId_date_idx" ON "FollowerSnapshot"("instagramAccountId", "date");

-- AddForeignKey
ALTER TABLE "FollowerSnapshot" ADD CONSTRAINT "FollowerSnapshot_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
