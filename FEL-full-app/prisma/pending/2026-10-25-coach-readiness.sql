-- COACH-READINESS (2026-10-25; owner coaching decision "a 30-second daily jump check; if readiness drops past the coach's
-- threshold, the day eases off and the coach is told"): the daily checks, the coaches' rules, and the alerts.
-- ADDITIVE ONLY: three new tables, their indexes and five foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   ReadinessJumpCheck — one row per athlete per day ('YYYY-MM-DD', the athlete's own calendar day): the day's jump
--                        NUMBERS only (best and mean of the counted jumps in cm, the session's typical error, how many
--                        jumps, the pose rate), the optional "how do you feel" tap (1–5), and the read: the band, its reason
--                        code, the baseline it was read against and the drop in %. Never a frame, a landmark or video.
--                        Unique (userId, day): the day's first check stands (one a day keeps the baseline honest).
--                        Written ONLY for a verified adult who opted in to saving movement numbers (lib/privacy/
--                        scanSaveGate.ts canSaveScanNumbers, row 1l); everyone else keeps their history on the phone.
--   ReadinessRule      — a coach's rule, per athlete or per team (TrainingGroup, prisma/pending/2026-10-25-teams-squads.sql;
--                        scopeId is that table's id, not a foreign key, so this file applies in either order with it):
--                        the kind ('drop_pct' | 'low_twice'), the threshold in %, the action ('ease' | 'tell').
--                        Unique (coachId, scope, scopeId).
--   ReadinessAlert     — one row per coach × athlete × day when a check read Low under that coach's rule AND the athlete
--                        shares readiness with that coach (a live 'coach_view' grant). Unique (coachId, athleteId, day):
--                        an alert fires once per day, however often the board is opened. seenAt when the coach dismisses it.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-24-coach-ai-draft.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/readiness/store.ts probes information_schema for ReadinessAlert (created
-- last): without the tables the check still runs and reads against the history kept on the phone, nothing is saved, Today
-- is served as written, coaches see no readiness alerts and their rule editor says "opens when the tables are applied".
-- Within ~5 minutes of applying, saving, the ease, the alerts and the rules are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model ReadinessJumpCheck {
--          id             String   @id
--          userId         String
--          /// The athlete's own calendar day, 'YYYY-MM-DD'.
--          day            String
--          bestCm         Float
--          meanCm         Float
--          teCm           Float
--          jumps          Int
--          poseHz         Float
--          feel           Int?
--          /// 'ready' | 'normal' | 'low' | 'building'.
--          band           String
--          reason         String
--          belowReal      Boolean  @default(false)
--          baselineCm     Float?
--          baselineMeanCm Float?
--          baselineN      Int?
--          dropPct        Float?
--          createdAt      DateTime @default(now())
--          user           User     @relation("ReadinessJumpChecks", fields: [userId], references: [id], onDelete: Cascade)
--          alerts         ReadinessAlert[]
--
--          @@unique([userId, day])
--          @@index([userId, createdAt])
--        }
--
--        model ReadinessRule {
--          id        String   @id
--          coachId   String
--          /// 'athlete' | 'team'.
--          scope     String
--          scopeId   String
--          /// 'drop_pct' | 'low_twice'.
--          kind      String
--          dropPct   Float
--          /// 'ease' | 'tell'.
--          action    String
--          updatedAt DateTime @default(now())
--          coach     User     @relation("ReadinessRules", fields: [coachId], references: [id], onDelete: Cascade)
--
--          @@unique([coachId, scope, scopeId])
--        }
--
--        model ReadinessAlert {
--          id        String    @id
--          coachId   String
--          athleteId String
--          day       String
--          checkId   String
--          action    String
--          reason    String
--          dropPct   Float?
--          createdAt DateTime  @default(now())
--          seenAt    DateTime?
--          coach     User               @relation("ReadinessAlertsCoach", fields: [coachId], references: [id], onDelete: Cascade)
--          athlete   User               @relation("ReadinessAlertsAthlete", fields: [athleteId], references: [id], onDelete: Cascade)
--          check     ReadinessJumpCheck @relation(fields: [checkId], references: [id], onDelete: Cascade)
--
--          @@unique([coachId, athleteId, day])
--          @@index([coachId, createdAt])
--        }
--
--      and the back-relations on model User:
--        readinessJumpChecks ReadinessJumpCheck[] @relation("ReadinessJumpChecks")
--        readinessRules      ReadinessRule[]      @relation("ReadinessRules")
--        readinessAlertsCoach   ReadinessAlert[]  @relation("ReadinessAlertsCoach")
--        readinessAlertsAthlete ReadinessAlert[]  @relation("ReadinessAlertsAthlete")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-coach-readiness.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): kept until the athlete deletes it (DELETE /api/readiness/check removes every check of theirs, and
-- the alerts with them) or the account goes (cascade). Not yet in lib/prq-data-rights.ts export/erase: flagged.
--
-- ROLLBACK (loses every check, rule and alert): DROP TABLE "ReadinessAlert"; DROP TABLE "ReadinessRule"; DROP TABLE "ReadinessJumpCheck";

-- CreateTable
CREATE TABLE "ReadinessJumpCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "bestCm" DOUBLE PRECISION NOT NULL,
    "meanCm" DOUBLE PRECISION NOT NULL,
    "teCm" DOUBLE PRECISION NOT NULL,
    "jumps" INTEGER NOT NULL,
    "poseHz" DOUBLE PRECISION NOT NULL,
    "feel" INTEGER,
    "band" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "belowReal" BOOLEAN NOT NULL DEFAULT false,
    "baselineCm" DOUBLE PRECISION,
    "baselineMeanCm" DOUBLE PRECISION,
    "baselineN" INTEGER,
    "dropPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessJumpCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessRule" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dropPct" DOUBLE PRECISION NOT NULL,
    "action" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessAlert" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "dropPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "ReadinessAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadinessJumpCheck_userId_createdAt_idx" ON "ReadinessJumpCheck"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessJumpCheck_userId_day_key" ON "ReadinessJumpCheck"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessRule_coachId_scope_scopeId_key" ON "ReadinessRule"("coachId", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "ReadinessAlert_coachId_createdAt_idx" ON "ReadinessAlert"("coachId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessAlert_coachId_athleteId_day_key" ON "ReadinessAlert"("coachId", "athleteId", "day");

-- AddForeignKey
ALTER TABLE "ReadinessJumpCheck" ADD CONSTRAINT "ReadinessJumpCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessRule" ADD CONSTRAINT "ReadinessRule_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAlert" ADD CONSTRAINT "ReadinessAlert_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAlert" ADD CONSTRAINT "ReadinessAlert_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAlert" ADD CONSTRAINT "ReadinessAlert_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ReadinessJumpCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
