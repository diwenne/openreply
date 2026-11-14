-- Additive only: every existing account keeps Instagram Login behaviour.
CREATE TYPE "MetaLogin" AS ENUM ('INSTAGRAM', 'UNIFIED');
ALTER TABLE "InstagramAccount" ADD COLUMN "metaLogin" "MetaLogin" NOT NULL DEFAULT 'INSTAGRAM';
