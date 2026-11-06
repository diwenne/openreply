-- Remove the Stripe billing layer and all plan limits.
-- This build is self-hosted: campaigns, DMs, accounts, and members are unlimited.
-- Monthly DM usage is still counted for the dashboard via
-- "usagePeriodStart" / "dmsSentThisPeriod", which are intentionally kept.

-- DropTable
DROP TABLE "BillingEvent";

-- AlterTable
ALTER TABLE "Workspace"
    DROP COLUMN "plan",
    DROP COLUMN "subscriptionStatus",
    DROP COLUMN "stripeCustomerId",
    DROP COLUMN "stripeSubscriptionId",
    DROP COLUMN "stripePriceId",
    DROP COLUMN "currentPeriodEnd";

-- DropEnum
DROP TYPE "Plan";

-- DropEnum
DROP TYPE "SubscriptionStatus";
