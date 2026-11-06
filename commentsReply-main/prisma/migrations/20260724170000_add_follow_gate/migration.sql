-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "requireFollow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followPromptMessage" TEXT,
ADD COLUMN     "followPromptButtonLabel" TEXT;
