-- AlterTable
ALTER TABLE "Automation" ALTER COLUMN "postId" DROP NOT NULL,
ADD COLUMN     "pendingNextReel" BOOLEAN NOT NULL DEFAULT false;
