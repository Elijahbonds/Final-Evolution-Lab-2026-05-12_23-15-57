-- MIRROR-COACH P5 (merged into lane/finish-release by PR #29 as 3fe481af): the health intake, pain check-in and
-- health-consent tables. ADDITIVE ONLY: three new tables, their indexes, and foreign keys to "User" (ON DELETE CASCADE).
-- No existing table or column is changed.
--
-- Generated 2026-09-29 offline, with no database connection:
--   prisma migrate diff --from-schema-datamodel <schema at 97ba6d9b^> --to-schema-datamodel <schema at 97ba6d9b> --script
--
-- Must exist in the production database BEFORE any deploy that contains 3fe481af, or the health intake, pain,
-- consent and guardian routes that read these tables return 500. Applying it is the owner's step (prisma db execute
-- --file, then an --after diff that comes back empty); lanes don't write to production.

-- CreateTable
CREATE TABLE "HealthIntake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "redFlags" TEXT[],
    "birthYear" INTEGER,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programExerciseId" TEXT,
    "exerciseName" TEXT NOT NULL,
    "bodyArea" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "acute" TEXT[],
    "note" TEXT,
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PainCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "coachId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HealthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthIntake_userId_createdAt_idx" ON "HealthIntake"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PainCheckIn_userId_createdAt_idx" ON "PainCheckIn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HealthConsent_userId_scope_idx" ON "HealthConsent"("userId", "scope");

-- AddForeignKey
ALTER TABLE "HealthIntake" ADD CONSTRAINT "HealthIntake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainCheckIn" ADD CONSTRAINT "PainCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthConsent" ADD CONSTRAINT "HealthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

