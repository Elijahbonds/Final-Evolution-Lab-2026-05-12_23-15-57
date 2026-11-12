-- SIGNATURE-PROGRAMS (2026-10-25; owner decisions "signature programs: all four, first", priority #3 of the round): the
-- owner's review of the four programs, and a solo athlete's place in one.
-- ADDITIVE ONLY: two new tables, their indexes and two foreign keys. No existing table or column is changed or dropped.
--
-- WHY THESE TWO, AND NOTHING ELSE. The programs themselves are code (lib/signature/content/*.ts), so nothing about them
-- is stored but the owner's decision and edits. A solo athlete cannot hold a coach's program today (CoachingProgram needs
-- a coach, and the /workout plan is a fixed sale), so the smallest seam on the existing structures is one row per athlete
-- per program: when they started, which session instances are done, and the plan's adaptation decisions. The plan is
-- recomputed from the program, those decisions and the retests on every read (lib/signature/plan.ts).
--
--   SignatureProgramReview — one row per program (programId = 'vertical-jump' | 'basketball-skills' |
--                            'athletic-foundation' | 'pain-free'): the owner's status ('draft' | 'approved' | 'rejected'),
--                            who decided, a note, and the owner's edits (JSON keyed by item: exercise and dose). No row =
--                            a draft. Only an approved program is shown to athletes.
--   SignatureEnrollment    — one row per athlete per program: startedAt, `done` (JSON: session instance "w3:B" → when),
--                            `events` (JSON: the checkpoint decisions — advance / repeat / continue, with the retest reads
--                            that decided them, as words like 'up' and 'down', never a number), endedAt when they stop.
--                            Unique (userId, programId). Written only for an adult (youth rules keep progress on the
--                            phone: lib/signature/server.ts) — no health answer, pain score or jump number is stored here.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-25-coach-readiness.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/signature/store.ts probes information_schema for SignatureEnrollment (created
-- last): without the tables every program reads as a draft (no athlete sees one), the admin can preview and read the
-- checks, and approving, editing and starting answer 503 signature_not_ready. Within ~5 minutes of applying, all of it
-- is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model SignatureProgramReview {
--          programId  String   @id
--          /// 'draft' | 'approved' | 'rejected'.
--          status     String   @default("draft")
--          reviewerId String?
--          note       String?
--          edits      Json     @default("{}")
--          updatedAt  DateTime @default(now())
--          reviewer   User?    @relation("SignatureReviews", fields: [reviewerId], references: [id], onDelete: SetNull)
--        }
--
--        model SignatureEnrollment {
--          id        String    @id
--          userId    String
--          programId String
--          startedAt DateTime  @default(now())
--          done      Json      @default("{}")
--          events    Json      @default("[]")
--          endedAt   DateTime?
--          updatedAt DateTime  @default(now())
--          user      User      @relation("SignatureEnrollments", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@unique([userId, programId])
--          @@index([userId, updatedAt])
--        }
--
--      and the back-relations on model User:
--        signatureReviews     SignatureProgramReview[] @relation("SignatureReviews")
--        signatureEnrollments SignatureEnrollment[]    @relation("SignatureEnrollments")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-signature-programs.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): an enrollment is kept until the athlete stops the program (endedAt; the row stays so a restart
-- is a fresh start) or the account goes (cascade). Not yet in lib/prq-data-rights.ts export/erase: flagged.
--
-- ROLLBACK (loses every review decision, edit and enrollment): DROP TABLE "SignatureEnrollment"; DROP TABLE "SignatureProgramReview";

-- CreateTable
CREATE TABLE "SignatureProgramReview" (
    "programId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewerId" TEXT,
    "note" TEXT,
    "edits" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureProgramReview_pkey" PRIMARY KEY ("programId")
);

-- CreateTable
CREATE TABLE "SignatureEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done" JSONB NOT NULL DEFAULT '{}',
    "events" JSONB NOT NULL DEFAULT '[]',
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureEnrollment_userId_updatedAt_idx" ON "SignatureEnrollment"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEnrollment_userId_programId_key" ON "SignatureEnrollment"("userId", "programId");

-- AddForeignKey
ALTER TABLE "SignatureProgramReview" ADD CONSTRAINT "SignatureProgramReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnrollment" ADD CONSTRAINT "SignatureEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
