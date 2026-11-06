-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpMessage" TEXT;
