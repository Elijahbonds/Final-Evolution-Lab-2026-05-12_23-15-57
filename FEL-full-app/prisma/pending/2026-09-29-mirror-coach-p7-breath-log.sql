-- MIRROR-COACH P7 (breath toolbox): the BreathLog table (schema.prisma model BreathLog) — one row per use of the
-- adults-only Dial-Up Breath, counted against FEL's own weekly limit (lib/breath/rampGate.ts RAMP_LIMIT). ADDITIVE
-- ONLY: one new table, one index, and a foreign key to "User" (ON DELETE CASCADE). No existing table or column is
-- changed or dropped.
--
-- Generated 2026-09-29 offline, with no database connection:
--   prisma migrate diff --from-schema-datamodel <schema at 0aab5356> --to-schema-datamodel <this commit's schema> --script
-- Re-generated in the P7 fix round and compared with the phase's outbox copy
-- (~/Claude/outbox/finish-release/painfree/p7/ramp-breath/breath-log-additive.sql): identical, statement for statement.
--
-- Needs prisma/pending/2026-09-29-mirror-coach-p5-health.sql and 2026-09-29-mirror-coach-p6-warmup-readiness.sql
-- applied first (the P5/P6 tables the same routes read). Must exist in production BEFORE any deploy that contains this
-- commit: without it GET/POST /api/breath/ramp, the Profile export (/api/prq/export), the account-wide erase
-- (/api/prq/delete) and the Health-data erase (/api/health/consent {action:'erase'}) all return 500 — the last three
-- are P5/P6 features that work today. Applying it is the owner's step (prisma db execute --file, then an --after diff
-- that comes back empty); lanes don't write to production (owner decision #29).

-- CreateTable
CREATE TABLE "BreathLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sessionId" TEXT,
    "seconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreathLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreathLog_userId_kind_createdAt_idx" ON "BreathLog"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "BreathLog" ADD CONSTRAINT "BreathLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

