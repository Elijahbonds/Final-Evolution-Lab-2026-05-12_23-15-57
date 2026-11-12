-- COACH-PARITY (lane/coach-parity, 2026-10-26; round-7 coaching teardown, docs/COACH-PARITY.md): the two table-stakes coach
-- tools every rival has and FEL did not — CHECK-IN FORMS (a coach's weekly or one-off questions, answered by the client,
-- read over time) and COACH-ASSIGNED HABITS (a daily or N-a-week target the client ticks off from Today). The third tool,
-- the paste-a-program importer, writes ONLY existing tables (CoachingProgram's blocks, sessions and prescriptions, and the
-- coach's own ProgramExercise catalogue) and needs nothing here.
-- ADDITIVE ONLY: five new tables, their indexes and seven foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED, AND WHAT IS NOT.
--   CoachCheckinForm   — a coach's form: title, cadence ('weekly' | 'once'), whether FEL's own pain check-in is offered
--                        with it (painCheck), and the questions as JSON (lib/coach/checkins/types.ts CheckinQuestion: id,
--                        kind 'scale' | 'yesno' | 'number' | 'choice' | 'text', prompt, topic 'training' | 'health', the
--                        choices or unit). archivedAt when the coach retires it (its answers stay readable).
--   CoachCheckinAssign — who answers it: one athlete on the coach's live roster, or one team the coach runs
--                        (TrainingGroup, prisma/pending/2026-10-25-teams-squads.sql; scopeId is that table's id, not a foreign
--                        key, so this file applies in either order with it — the ReadinessRule precedent).
--   CoachCheckinAnswer — one row per form × athlete × period ('YYYY-MM-DD' = the Monday of the PT week for a weekly form,
--                        'once' for a one-off). `answers` holds the TRAINING answers only; `health` holds the answers to
--                        health questions, written only for a verified adult with a live health_data grant (the existing
--                        rules: lib/privacy/healthWriteGate.ts, lib/health/consent.ts) and shown to the coach only with that
--                        athlete's live coach_view grant. PAIN IS NOT HERE: a form that offers pain hands the athlete FEL's
--                        own pain check-in (components/coach/pain-checkin.tsx → POST /api/health/pain → PainCheckIn), so
--                        there is one pain path, with its own rule and gates. A teen's row has no health and no free text.
--   CoachHabit         — a coach's habit: a preset key or 'custom', its label, check (yes/no) or count (with a target and a
--                        unit), daily or N days a week, topic 'training' | 'health', assigned to one athlete or one team.
--   CoachHabitTick     — one row per habit × athlete × PT day: done, or the number done. Unique (habitId, athleteId, day).
-- Nothing here pays Lab Credits, moves PRQ or touches the play streak (PlayerProfile): a habit's streak is computed from
-- these rows on read (lib/coach/habits/rules.ts), never stored.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-24-coach-ai-draft.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/parity/probe.ts probes information_schema for CoachHabitTick (created
-- last): without the tables the coach's Check-ins and Habits panels say "coming soon", the client's Today shows neither
-- card, every read answers { available: false } and every write 503 parity_not_ready. Nothing 500s. Within ~5 minutes of
-- applying, both are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model CoachCheckinForm {
--          id         String    @id
--          coachId    String
--          title      String
--          /// 'weekly' | 'once'.
--          cadence    String
--          painCheck  Boolean   @default(false)
--          /// CheckinQuestion[] (lib/coach/checkins/types.ts).
--          questions  Json
--          archivedAt DateTime?
--          createdAt  DateTime  @default(now())
--          updatedAt  DateTime  @default(now())
--          coach      User      @relation("CoachCheckinForms", fields: [coachId], references: [id], onDelete: Cascade)
--          assigns    CoachCheckinAssign[]
--          answers    CoachCheckinAnswer[]
--
--          @@index([coachId, createdAt])
--        }
--
--        model CoachCheckinAssign {
--          id        String   @id
--          formId    String
--          coachId   String
--          /// 'athlete' | 'team'.
--          scope     String
--          scopeId   String
--          createdAt DateTime @default(now())
--          form      CoachCheckinForm @relation(fields: [formId], references: [id], onDelete: Cascade)
--
--          @@unique([formId, scope, scopeId])
--          @@index([scope, scopeId])
--        }
--
--        model CoachCheckinAnswer {
--          id        String   @id
--          formId    String
--          coachId   String
--          athleteId String
--          /// The PT week's Monday 'YYYY-MM-DD' (weekly) or 'once'.
--          period    String
--          answers   Json
--          health    Json?
--          createdAt DateTime @default(now())
--          updatedAt DateTime @default(now())
--          form      CoachCheckinForm @relation(fields: [formId], references: [id], onDelete: Cascade)
--          athlete   User             @relation("CoachCheckinAnswers", fields: [athleteId], references: [id], onDelete: Cascade)
--
--          @@unique([formId, athleteId, period])
--          @@index([coachId, createdAt])
--        }
--
--        model CoachHabit {
--          id         String    @id
--          coachId    String
--          scope      String
--          scopeId    String
--          preset     String
--          label      String
--          /// 'check' | 'count'.
--          kind       String
--          target     Float?
--          unit       String?
--          /// 'daily' | 'weekly'.
--          frequency  String
--          perWeek    Int?
--          /// 'training' | 'health'.
--          topic      String
--          archivedAt DateTime?
--          createdAt  DateTime  @default(now())
--          coach      User      @relation("CoachHabits", fields: [coachId], references: [id], onDelete: Cascade)
--          ticks      CoachHabitTick[]
--
--          @@index([coachId, createdAt])
--          @@index([scope, scopeId])
--        }
--
--        model CoachHabitTick {
--          id        String   @id
--          habitId   String
--          athleteId String
--          /// The athlete's PT day, 'YYYY-MM-DD'.
--          day       String
--          value     Float?
--          createdAt DateTime @default(now())
--          habit     CoachHabit @relation(fields: [habitId], references: [id], onDelete: Cascade)
--          athlete   User       @relation("CoachHabitTicks", fields: [athleteId], references: [id], onDelete: Cascade)
--
--          @@unique([habitId, athleteId, day])
--          @@index([athleteId, day])
--        }
--
--      and the back-relations on model User:
--        coachCheckinForms   CoachCheckinForm[]   @relation("CoachCheckinForms")
--        coachCheckinAnswers CoachCheckinAnswer[] @relation("CoachCheckinAnswers")
--        coachHabits         CoachHabit[]         @relation("CoachHabits")
--        coachHabitTicks     CoachHabitTick[]     @relation("CoachHabitTicks")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-coach-parity.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): kept until the athlete or coach deletes it, or the account goes. Export and erase:
-- lib/data-rights/registry.ts (the athlete's answers and ticks are theirs; an erased coach's forms and habits go, and the
-- answers and ticks under them cascade — flagged in docs/COACH-PARITY.md).
--
-- ROLLBACK (loses every form, answer, habit and tick):
--   DROP TABLE "CoachHabitTick"; DROP TABLE "CoachHabit"; DROP TABLE "CoachCheckinAnswer"; DROP TABLE "CoachCheckinAssign"; DROP TABLE "CoachCheckinForm";

-- CreateTable
CREATE TABLE "CoachCheckinForm" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "painCheck" BOOLEAN NOT NULL DEFAULT false,
    "questions" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachCheckinForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachCheckinAssign" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachCheckinAssign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachCheckinAnswer" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "health" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachCheckinAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachHabit" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" DOUBLE PRECISION,
    "unit" TEXT,
    "frequency" TEXT NOT NULL,
    "perWeek" INTEGER,
    "topic" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachHabit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachHabitTick" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachHabitTick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachCheckinForm_coachId_createdAt_idx" ON "CoachCheckinForm"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachCheckinAssign_scope_scopeId_idx" ON "CoachCheckinAssign"("scope", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachCheckinAssign_formId_scope_scopeId_key" ON "CoachCheckinAssign"("formId", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "CoachCheckinAnswer_coachId_createdAt_idx" ON "CoachCheckinAnswer"("coachId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachCheckinAnswer_formId_athleteId_period_key" ON "CoachCheckinAnswer"("formId", "athleteId", "period");

-- CreateIndex
CREATE INDEX "CoachHabit_coachId_createdAt_idx" ON "CoachHabit"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachHabit_scope_scopeId_idx" ON "CoachHabit"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "CoachHabitTick_athleteId_day_idx" ON "CoachHabitTick"("athleteId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CoachHabitTick_habitId_athleteId_day_key" ON "CoachHabitTick"("habitId", "athleteId", "day");

-- AddForeignKey
ALTER TABLE "CoachCheckinForm" ADD CONSTRAINT "CoachCheckinForm_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCheckinAssign" ADD CONSTRAINT "CoachCheckinAssign_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CoachCheckinForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCheckinAnswer" ADD CONSTRAINT "CoachCheckinAnswer_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CoachCheckinForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCheckinAnswer" ADD CONSTRAINT "CoachCheckinAnswer_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabit" ADD CONSTRAINT "CoachHabit_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitTick" ADD CONSTRAINT "CoachHabitTick_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "CoachHabit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitTick" ADD CONSTRAINT "CoachHabitTick_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
