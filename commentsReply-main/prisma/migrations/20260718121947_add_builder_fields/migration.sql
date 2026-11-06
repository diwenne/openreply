-- AlterTable
ALTER TABLE "Automation"
  ADD COLUMN     "matchAnyPost" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "matchAnyWord" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "openingDmEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "openingDmMessage" TEXT,
  ADD COLUMN     "openingDmButtonLabel" TEXT;
