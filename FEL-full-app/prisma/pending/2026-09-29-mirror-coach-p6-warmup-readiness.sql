-- MIRROR-COACH P6 (warm-up, cool-down, readiness): ADDITIVE ONLY. A new enum and a "Session".kind column that defaults
-- every existing row to 'training'; a nullable "ClientSession".cooldownDoneAt; "GuardianConsent".acceptedById (nullable)
-- and selfRequested (default false); a new "ReadinessCheckIn" table with a unique (userId, date) and a foreign key to
-- "User" (ON DELETE CASCADE). No existing column is changed or dropped.
--
-- Generated 2026-09-29 offline, with no database connection:
--   prisma migrate diff --from-schema-datamodel <schema at 97ba6d9b> --to-schema-datamodel <this commit's schema> --script
-- It matches the phase's three hand-written files statement for statement.
--
-- Needs prisma/pending/2026-09-29-mirror-coach-p5-health.sql applied first (P5's tables). Must exist in production
-- BEFORE any deploy that contains this commit, or Today, the program builder and every GuardianConsent query return 500.
-- Applying it is the owner's step; lanes don't write to production.

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('training', 'recovery');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'training';

-- AlterTable
ALTER TABLE "ClientSession" ADD COLUMN     "cooldownDoneAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GuardianConsent" ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "selfRequested" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReadinessCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sleep" INTEGER,
    "soreness" INTEGER,
    "energy" INTEGER,
    "mood" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessCheckIn_userId_date_key" ON "ReadinessCheckIn"("userId", "date");

-- AddForeignKey
ALTER TABLE "ReadinessCheckIn" ADD CONSTRAINT "ReadinessCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

