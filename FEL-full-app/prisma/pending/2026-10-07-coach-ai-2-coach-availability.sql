-- COACH-AI Phase 8 (2026-10-07; the Phase 8 plan item "teen availability status: Full / Limited / Out, never a
-- diagnosis"): CoachAvailability — one row per coach <-> athlete pair while the athlete is Limited or Out.
-- ADDITIVE ONLY: one new table, one index, one foreign key to the existing CoachClient (coachId, clientId) unique key,
-- ON DELETE CASCADE (deleting the pair, or either account, removes the status; ENDING the pair — CoachClient.endedAt —
-- hides it from both sides in code). No existing table or column is changed or dropped.
--
-- WHAT IS (AND IS NOT) STORED: a status ('limited' | 'out' — Full is the absence of a row, so setting Full deletes it),
-- an optional expected return day 'YYYY-MM-DD', and when it was set. There is no note, reason or free-text column, on
-- purpose: this is the coach's training record, never a diagnosis, and for a minor it must not become a medical record.
-- The route refuses any other field (lib/coach/availability.ts). The athlete writes nothing here.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (same reason as 2026-10-07-coach-ai-1-message-read-markers.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/availabilityServer.ts probes information_schema for the table: without
-- it the reads say "not available" (the pickers and the athlete's line do not show) and a set answers 503
-- availability_unavailable. Within ~5 minutes of applying, it is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4), after 2026-10-07-coach-ai-1-message-read-markers.sql:
--   1. Locally, add to prisma/schema.prisma — the model, and ONE relation field (not a column) on model CoachClient:
--
--        model CoachAvailability {
--          coachId  String
--          clientId String
--          /// 'limited' | 'out'. Full is no row. Never a diagnosis: no free-text field, by design.
--          status   String
--          /// Expected return day 'YYYY-MM-DD', or null.
--          returnBy String?
--          setAt    DateTime @default(now())
--          link     CoachClient @relation(fields: [coachId, clientId], references: [coachId, clientId], onDelete: Cascade)
--
--          @@id([coachId, clientId])
--          @@index([clientId])
--        }
--
--      and in model CoachClient:   availability CoachAvailability?
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below (plus file 1's ALTER if not yet applied).
--   3. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-07-coach-ai-2-coach-availability.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client as in file 1, step 5 (one regenerate covers both files).
--
-- ROLLBACK (drops every recorded status; nothing else depends on it): DROP TABLE "CoachAvailability";

-- CreateTable
CREATE TABLE "CoachAvailability" (
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "returnBy" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAvailability_pkey" PRIMARY KEY ("coachId","clientId")
);

-- CreateIndex
CREATE INDEX "CoachAvailability_clientId_idx" ON "CoachAvailability"("clientId");

-- AddForeignKey
ALTER TABLE "CoachAvailability" ADD CONSTRAINT "CoachAvailability_coachId_clientId_fkey" FOREIGN KEY ("coachId", "clientId") REFERENCES "CoachClient"("coachId", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;
