-- COACH-DELIVERY (lane/coach-delivery, 2026-10-26; round-8 backlog COA-01/03/04/05/10, docs/COACH-DELIVERY.md): the coach-platform
-- parity gaps coach-parity did not cover — AUTOMATIONS (a message on join, after missed sessions, weekly), a READINESS
-- SURVEY beside the jump check, BRANDING (logo and accent), ROSTER SESSIONS on a calendar with an .ics feed, and CLIENT
-- REVIEWS of a coach once a package ends.
-- ADDITIVE ONLY: seven new tables, their indexes and nine foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED, AND WHAT IS NOT.
--   CoachAutomation     — a coach's automation: trigger 'join' | 'missed' | 'weekly', who it reaches ('roster' | 'athlete' |
--                         'team' + scopeId), missedN (sessions missed in the last 7 days, lib/coach/alerts.ts), weekday +
--                         hour (the PT clock) for a weekly one, a preset key or the coach's own text. enabled, archivedAt.
--   CoachAutomationRun  — the audit and the dedupe: one row per automation × athlete × PT day, with what happened
--                         ('posted' | 'skipped_teen' | 'skipped_no_thread') and the ProgramMessage it posted. Unique
--                         (automationId, athleteId, day). An automation only ever POSTS INTO AN EXISTING PROGRAM THREAD
--                         (ProgramMessage); it never emails.
--   ReadinessSurvey     — one row per athlete × day: five 1–5 answers (sleep, soreness, energy, mood, ready to train), the
--                         count of low answers and the day's band ('normal' | 'low') under FEL's own readiness rule
--                         (lib/health/readiness.ts). HEALTH DATA: written only for a verified adult with a live health_data
--                         grant (lib/privacy/healthWriteGate.ts HEALTH_WRITE_ROUTES i), seen by a coach only with that
--                         athlete's live coach_view grant (lib/coach/readiness/gate.ts coachMaySee).
--   CoachBranding       — one row per coach: an accent colour ('#RRGGBB') and a logo object path in the EXISTING public
--                         creator bucket (CREATOR_MEDIA_PUBLIC_BUCKET); no logo when the bucket is not set. No new storage.
--   CoachRosterSession  — a session on the coach's calendar (not a paid booking): title, start, minutes, an optional place
--                         (a venue name; the form says never a home address), who it is for ('roster' | 'athlete' | 'team'
--                         + scopeId), cancelledAt. Read into an .ics feed per coach and per athlete.
--   CoachCalendarFeed   — one row per person who turned their calendar feed on: a random nonce the feed link is signed
--                         with, so "reset the link" kills every old copy of it. No calendar data is stored here.
--   CoachReview         — an adult client's review of a coach after a package ended: 1–5 stars and optional text (text is
--                         screened before it is stored and shown), status 'shown' | 'hidden' (the coach may hide one from
--                         their page; it is never edited). Unique (coachId, athleteId): one review per client per coach.
--                         saleId is the CoachSale that made them eligible (no foreign key: the coach-business SQL may be
--                         applied in either order; the ReadinessRule precedent).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-26-coach-parity.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/delivery/probe.ts probes information_schema for CoachReview (created
-- last): without the tables every panel says "coming soon", every read answers { available: false }, every write 503
-- delivery_not_ready, the automation sweep does nothing, the feed is a 404. Nothing 500s. Within ~5 minutes of applying,
-- all five features are on (the review and automation switches in .env.example still apply).
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma the seven models below (each with a relation to User, onDelete: Cascade, and the
--      back-relation lists on model User), mirroring the CREATE TABLE statements exactly.
--   2. Preview read-only: npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      and diff it against this file. Anything more means production is behind another lane's file: stop and review.
--   3. Apply exactly this file: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-coach-delivery.sql
--   4. Verify: the same migrate diff prints an empty migration.
--
-- ROLLBACK (loses every automation and its audit, every survey, branding, roster session, feed link and review):
--   DROP TABLE "CoachReview"; DROP TABLE "CoachCalendarFeed"; DROP TABLE "CoachRosterSession"; DROP TABLE "CoachBranding";
--   DROP TABLE "ReadinessSurvey"; DROP TABLE "CoachAutomationRun"; DROP TABLE "CoachAutomation";

-- CreateTable
CREATE TABLE "CoachAutomation" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'roster',
    "scopeId" TEXT,
    "missedN" INTEGER,
    "weekday" INTEGER,
    "hour" INTEGER,
    "preset" TEXT,
    "text" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "programId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessSurvey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "sleep" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "mood" INTEGER NOT NULL,
    "ready" INTEGER NOT NULL,
    "lowItems" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachBranding" (
    "coachId" TEXT NOT NULL,
    "accent" TEXT,
    "logoPath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachBranding_pkey" PRIMARY KEY ("coachId")
);

-- CreateTable
CREATE TABLE "CoachRosterSession" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "place" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'roster',
    "scopeId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachRosterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachCalendarFeed" (
    "userId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachCalendarFeed_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CoachReview" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "saleId" TEXT,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'shown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachAutomation_coachId_createdAt_idx" ON "CoachAutomation"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachAutomation_enabled_trigger_idx" ON "CoachAutomation"("enabled", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "CoachAutomationRun_automationId_athleteId_day_key" ON "CoachAutomationRun"("automationId", "athleteId", "day");

-- CreateIndex
CREATE INDEX "CoachAutomationRun_coachId_createdAt_idx" ON "CoachAutomationRun"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachAutomationRun_athleteId_idx" ON "CoachAutomationRun"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessSurvey_userId_day_key" ON "ReadinessSurvey"("userId", "day");

-- CreateIndex
CREATE INDEX "CoachRosterSession_coachId_startsAt_idx" ON "CoachRosterSession"("coachId", "startsAt");

-- CreateIndex
CREATE INDEX "CoachRosterSession_scope_scopeId_idx" ON "CoachRosterSession"("scope", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachReview_coachId_athleteId_key" ON "CoachReview"("coachId", "athleteId");

-- CreateIndex
CREATE INDEX "CoachReview_athleteId_idx" ON "CoachReview"("athleteId");

-- AddForeignKey
ALTER TABLE "CoachAutomation" ADD CONSTRAINT "CoachAutomation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAutomationRun" ADD CONSTRAINT "CoachAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CoachAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAutomationRun" ADD CONSTRAINT "CoachAutomationRun_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessSurvey" ADD CONSTRAINT "ReadinessSurvey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachBranding" ADD CONSTRAINT "CoachBranding_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRosterSession" ADD CONSTRAINT "CoachRosterSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCalendarFeed" ADD CONSTRAINT "CoachCalendarFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReview" ADD CONSTRAINT "CoachReview_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
