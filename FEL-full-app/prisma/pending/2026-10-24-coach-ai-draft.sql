-- COACH-AI-DRAFT (2026-10-24; owner decision "build first: AI-drafted weekly program updates from real client data,
-- approved by the coach"): the weekly drafts and the audit trail of every coach decision on them.
-- ADDITIVE ONLY: two new tables, their indexes and three foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   CoachProgramDraft  — one row per coach × athlete × program × week ('YYYY-MM-DD', the Monday, UTC): the draft as the
--                        rules engine (and, when the AI switch is on, the AI layer's wording) made it, as JSON. The unique
--                        key is what makes weekly generation idempotent: a second request in the same week reads the
--                        first row (INSERT … ON CONFLICT DO NOTHING).
--   CoachDraftDecision — one row per decision on one change: approved, edited (approved with the coach's numbers),
--                        rejected, or partial (some of a multi-row change written before a write failed). WHO decided
--                        (actorId, the coach), WHEN (decidedAt), WHAT it was (before) and became (after), the line the
--                        athlete reads (clientLine) and the coach's optional note. Unique (draftId, changeId): a change is
--                        decided once, so a double tap never writes twice.
-- The draft JSON holds program edits and the reasons a coach reads. For an athlete who shared pain or readiness with
-- this coach (coach_view), a reason may name that ("They reported pain on Goblet squat (knee)…") — the same words the
-- coach's attention board already shows them; nothing is stored for an athlete who did not share it.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-07-coach-ai-2-coach-availability.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/weeklyDraft/store.ts probes information_schema for the tables: without
-- them the coach still reads this week's drafts (computed, not stored), approving answers 503 drafts_not_ready and the
-- athlete's "plan updated" card shows nothing. Within ~5 minutes of applying, approvals are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model CoachProgramDraft {
--          id        String   @id
--          coachId   String
--          clientId  String
--          programId String
--          /// The week's Monday, UTC, 'YYYY-MM-DD'.
--          weekKey   String
--          /// 'rules' | 'rules+ai'.
--          engine    String
--          draft     Json
--          createdAt DateTime @default(now())
--          coach     User            @relation("CoachProgramDrafts", fields: [coachId], references: [id], onDelete: Cascade)
--          program   CoachingProgram @relation(fields: [programId], references: [id], onDelete: Cascade)
--          decisions CoachDraftDecision[]
--
--          @@unique([coachId, clientId, programId, weekKey])
--          @@index([clientId])
--        }
--
--        model CoachDraftDecision {
--          id         String   @id
--          draftId    String
--          changeId   String
--          /// 'approved' | 'edited' | 'rejected' | 'partial'.
--          decision   String
--          actorId    String
--          programId  String
--          clientId   String
--          before     Json?
--          after      Json?
--          clientLine String?
--          note       String?
--          decidedAt  DateTime @default(now())
--          draft      CoachProgramDraft @relation(fields: [draftId], references: [id], onDelete: Cascade)
--
--          @@unique([draftId, changeId])
--          @@index([clientId, decidedAt])
--        }
--
--      and the back-relations:  model User { coachProgramDrafts CoachProgramDraft[] @relation("CoachProgramDrafts") }
--                               model CoachingProgram { weeklyDrafts CoachProgramDraft[] }
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-24-coach-ai-draft.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ROLLBACK (loses every draft and every recorded decision; the program edits already approved stay, they are ordinary
-- builder writes): DROP TABLE "CoachDraftDecision"; DROP TABLE "CoachProgramDraft";

-- CreateTable
CREATE TABLE "CoachProgramDraft" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachProgramDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachDraftDecision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "clientLine" TEXT,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachDraftDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachProgramDraft_clientId_idx" ON "CoachProgramDraft"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachProgramDraft_coachId_clientId_programId_weekKey_key" ON "CoachProgramDraft"("coachId", "clientId", "programId", "weekKey");

-- CreateIndex
CREATE INDEX "CoachDraftDecision_clientId_decidedAt_idx" ON "CoachDraftDecision"("clientId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachDraftDecision_draftId_changeId_key" ON "CoachDraftDecision"("draftId", "changeId");

-- AddForeignKey
ALTER TABLE "CoachProgramDraft" ADD CONSTRAINT "CoachProgramDraft_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachProgramDraft" ADD CONSTRAINT "CoachProgramDraft_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CoachingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachDraftDecision" ADD CONSTRAINT "CoachDraftDecision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CoachProgramDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
