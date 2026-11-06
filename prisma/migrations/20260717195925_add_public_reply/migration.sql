-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicReplyMessage" TEXT;
