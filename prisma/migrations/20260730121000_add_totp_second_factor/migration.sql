-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
