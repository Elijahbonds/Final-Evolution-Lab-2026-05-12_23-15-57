-- ECONOMY-CAPS (2026-10-01): GameSession.runId + SessionRun.agentRun
-- ADDITIVE ONLY. Generated offline:
--   prisma migrate diff --from-schema-datamodel <main schema> --to-schema-datamodel prisma/schema.prisma --script
-- (servedExerciseId is in 2026-09-29-mirror-coach-p8-served-exercise.sql — apply that first if not already.)
--
-- ORDER: apply BEFORE any deploy that contains #89 / ECONOMY-CAPS. Without runId/agentRun, session paths that
-- select those columns 500. Applying is the owner's step (prisma db execute --file, then an --after diff that
-- comes back empty); this cloud agent has no production DATABASE_URL.

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "SessionRun" ADD COLUMN     "agentRun" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_runId_key" ON "GameSession"("runId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SessionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
