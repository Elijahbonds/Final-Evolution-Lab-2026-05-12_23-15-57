-- COMBINE-DAY (lane/combine-day, 2026-10-25; owner's round item "team tryout / combine day": a coach runs a measured
-- combine through the Mirror — jump, sprint, agility and skills — and gets a ranked report).
-- ADDITIVE ONLY: three new tables, their indexes and five foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED, AND WHAT IS NOT. NUMBERS ONLY: no picture, no video, no pose frame, no free-text note.
--   CombineEvent    — one combine a coach ran: the coach, a name the coach typed (60 characters at most), the team it was
--                     run for (a TrainingGroup id as plain text, no foreign key: that table is itself pending), the
--                     stations (a JSON list of { kind, variant, attempts } from a fixed catalogue, lib/combine/catalogue.ts)
--                     and the composite's weights (a JSON map of station id → 0–3).
--   CombineEntrant  — one row per athlete on the combine, in line order. Only accounts on the coach's live roster who pass
--                     the team gate (lib/combine/gate.ts: the coach loop's teen gate — adults today; every 13–17 is held
--                     until the coach-training guardian wording is live; under 13 never). A name the coach typed is never
--                     stored: it stays on the coach's phone.
--   CombineResult   — one row per attempt: station id, attempt number (1-based), the value (cm for a jump, seconds for a
--                     hand-timed sprint or agility drill, % for a drill score; null = no mark), the approach jump's touch
--                     height (cm, or null) and the method ('camera' | 'video' | 'hand'). A camera or video number is kept
--                     only for a verified adult with the live movement-numbers opt-in (lib/privacy/scanSaveGate.ts
--                     canSaveScanNumbers, row 1m of SCAN_SAVE_ROUTES); anyone else's stays on the coach's phone.
-- WHO READS IT: the coach who ran it (GET /api/coach/combine/[id]) and each athlete, their own rows only
-- (GET /api/combine/mine). There is no public page and no ranking anyone else can open.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-25-teams-squads.sql, 2026-10-25-coach-readiness.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/combine/store.ts probes information_schema for "CombineResult" (created last):
-- without it GET /api/coach/combine answers { available: false } (the roster and the gates still come back, so a combine
-- runs as a draft on the coach's phone), every write answers 503 combine_not_ready, and /train/combine says "coming
-- soon". Nothing 500s. Within ~5 minutes of applying, saving to the account is on, with no deploy.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model CombineEvent {
--          id        String   @id
--          coachId   String
--          /// Typed by the coach, 60 characters at most.
--          name      String
--          /// A TrainingGroup id (plain text: no relation), or null for a roster pick.
--          teamId    String?
--          /// [{ kind, variant, attempts }] from lib/combine/catalogue.ts.
--          stations  Json
--          /// { [stationId]: 0..3 }.
--          weights   Json
--          createdAt DateTime @default(now())
--          updatedAt DateTime @default(now())
--          coach     User     @relation("CombineEventsRun", fields: [coachId], references: [id], onDelete: Cascade)
--          entrants  CombineEntrant[]
--          results   CombineResult[]
--
--          @@index([coachId, createdAt])
--        }
--
--        model CombineEntrant {
--          eventId   String
--          athleteId String
--          position  Int
--          event     CombineEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
--          athlete   User         @relation("CombineEntries", fields: [athleteId], references: [id], onDelete: Cascade)
--
--          @@id([eventId, athleteId])
--          @@index([athleteId])
--        }
--
--        model CombineResult {
--          id         String   @id
--          eventId    String
--          athleteId  String
--          /// `${kind}:${variant}` (lib/combine/catalogue.ts stationId).
--          stationId  String
--          /// 1-based.
--          attempt    Int
--          /// cm | s | %; null = no mark.
--          value      Float?
--          touchCm    Float?
--          /// 'camera' | 'video' | 'hand'.
--          method     String
--          recordedAt DateTime @default(now())
--          event      CombineEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
--          athlete    User         @relation("CombineResults", fields: [athleteId], references: [id], onDelete: Cascade)
--
--          @@unique([eventId, athleteId, stationId, attempt])
--          @@index([athleteId])
--        }
--
--      and the back-relations on model User:
--        combineEventsRun CombineEvent[]   @relation("CombineEventsRun")
--        combineEntries   CombineEntrant[] @relation("CombineEntries")
--        combineResults   CombineResult[]  @relation("CombineResults")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-combine-day.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ACCOUNT DELETION: every row naming a user cascades with the User row (the coach → their combines and everything in
-- them; an athlete → their entry and their results).
--
-- ROLLBACK (loses every saved combine and its results; drafts on coaches' phones are untouched):
--   DROP TABLE "CombineResult"; DROP TABLE "CombineEntrant"; DROP TABLE "CombineEvent";

-- CreateTable
CREATE TABLE "CombineEvent" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamId" TEXT,
    "stations" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombineEntrant" (
    "eventId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CombineEntrant_pkey" PRIMARY KEY ("eventId","athleteId")
);

-- CreateTable
CREATE TABLE "CombineResult" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "touchCm" DOUBLE PRECISION,
    "method" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombineResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CombineEvent_coachId_createdAt_idx" ON "CombineEvent"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CombineEntrant_athleteId_idx" ON "CombineEntrant"("athleteId");

-- CreateIndex
CREATE INDEX "CombineResult_athleteId_idx" ON "CombineResult"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CombineResult_eventId_athleteId_stationId_attempt_key" ON "CombineResult"("eventId", "athleteId", "stationId", "attempt");

-- AddForeignKey
ALTER TABLE "CombineEvent" ADD CONSTRAINT "CombineEvent_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombineEntrant" ADD CONSTRAINT "CombineEntrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CombineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombineEntrant" ADD CONSTRAINT "CombineEntrant_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombineResult" ADD CONSTRAINT "CombineResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CombineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombineResult" ADD CONSTRAINT "CombineResult_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
