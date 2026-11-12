-- EXERCISE-LIBRARY (2026-10-25; owner decisions: a shared library of 5,000+ exercises, an open public-domain seed plus
-- FEL-authored drafts the owner reviews, coach exercises private by default with "submit to library" and owner or
-- moderator approval). ADDITIVE ONLY: two new tables, one new nullable column on "ProgramExercise", their indexes and
-- two foreign keys. No existing column, index or constraint is changed or dropped.
--
-- WHERE THE LIBRARY LIVES. Its content ships IN THE REPO as data files (data/library/seed/*.json — the free-exercise-db
-- seed, Unlicense; data/library/authored/*.json — FEL's own drafts), checked by scripts/library/validate.ts. The app reads
-- those files with or without this SQL. These tables hold only what changes at run time:
--   LibraryExercise   — a full copy of an entry the owner has ACTED ON: approved, rejected or edited (a row with the
--                       same id overrides the file entry), and every approved coach submission (no file entry). Until a
--                       row exists, an entry is a draft and coaches see it only with "show drafts" on.
--   LibrarySubmission — a coach's "submit to library": a snapshot of their own catalogue row and its moderation state
--                       ('pending' → 'approved' | 'rejected', or 'withdrawn' by the coach).
--   ProgramExercise.libraryExerciseId — the library entry a coach's private row was copied from ("Add to my catalogue"
--                       keeps the link; the coach edits their copy freely). A soft link, NO foreign key: an entry can live
--                       in a data file with no LibraryExercise row, which a foreign key would refuse. Same shape as the
--                       table's own regressionOfId / progressionOfId (plain String?, no FK).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-24-coach-ai-draft.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/library/store.ts probes information_schema (the shared probe,
-- lib/coach/pendingSchema.ts): without these tables the library still searches and shows every entry (as drafts), and
-- the four writes answer 503 library_not_ready — approve/edit/reject, submit, moderate, and the copy's link (the copy
-- itself still lands in the coach's catalogue, unlinked). Within ~5 minutes of applying, they are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model LibraryExercise {
--          id               String    @id
--          slug             String    @unique
--          name             String
--          aliases          String[]  @default([])
--          family           String
--          variation        String
--          /// a MovementPattern value, stored as text (the enum is not widened by this file)
--          pattern          String
--          plane            String
--          laterality       String
--          category         String
--          level            String
--          equipment        String[]  @default([])
--          primaryMuscles   String[]  @default([])
--          secondaryMuscles String[]  @default([])
--          sportTags        String[]  @default([])
--          goals            String[]  @default([])
--          skillLayer       String?
--          braceMode        String?
--          setup            String
--          cues             String[]  @default([])
--          faults           Json
--          regressionId     String?
--          progressionId    String?
--          cautions         String[]  @default([])
--          lowLoad          String[]  @default([])
--          youthOk          Boolean   @default(true)
--          prehabNote       String?
--          dosage           Json
--          clipKey          String
--          videoUrl         String?
--          imageRef         String?
--          /// 'seed' | 'authored' | 'coach-submitted'
--          sourceKind       String
--          sourceRef        String?
--          sourceUrl        String?
--          licence          String
--          /// 'draft' | 'approved' | 'rejected'
--          reviewStatus     String    @default("draft")
--          reviewerId       String?
--          reviewBatch      String
--          reviewedAt       DateTime?
--          createdAt        DateTime  @default(now())
--          updatedAt        DateTime  @default(now())
--
--          @@index([reviewStatus, reviewBatch])
--        }
--
--        model LibrarySubmission {
--          id                String    @id
--          coachId           String
--          programExerciseId String?
--          payload           Json
--          /// 'pending' | 'approved' | 'rejected' | 'withdrawn'
--          status            String    @default("pending")
--          moderatorId       String?
--          moderatorNote     String?
--          libraryExerciseId String?
--          createdAt         DateTime  @default(now())
--          decidedAt         DateTime?
--          coach             User             @relation("LibrarySubmissions", fields: [coachId], references: [id], onDelete: Cascade)
--          programExercise   ProgramExercise? @relation(fields: [programExerciseId], references: [id], onDelete: SetNull)
--
--          @@index([status, createdAt])
--          @@index([coachId])
--        }
--
--      in model ProgramExercise, one column and one back-relation:
--          libraryExerciseId String?   // the library entry this row was copied from (soft link, no FK: see the SQL header)
--          librarySubmissions LibrarySubmission[]
--          @@index([libraryExerciseId])
--      and in model User:   librarySubmissions LibrarySubmission[] @relation("LibrarySubmissions")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-exercise-library.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ROLLBACK (loses every review decision, every owner edit and every submission; the data files and every coach's
-- catalogue rows stay): DROP TABLE "LibrarySubmission"; DROP TABLE "LibraryExercise";
--   DROP INDEX "ProgramExercise_libraryExerciseId_idx"; ALTER TABLE "ProgramExercise" DROP COLUMN "libraryExerciseId";

-- AlterTable
ALTER TABLE "ProgramExercise" ADD COLUMN     "libraryExerciseId" TEXT;

-- CreateTable
CREATE TABLE "LibraryExercise" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "family" TEXT NOT NULL,
    "variation" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "plane" TEXT NOT NULL,
    "laterality" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryMuscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondaryMuscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sportTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillLayer" TEXT,
    "braceMode" TEXT,
    "setup" TEXT NOT NULL,
    "cues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faults" JSONB NOT NULL,
    "regressionId" TEXT,
    "progressionId" TEXT,
    "cautions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lowLoad" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "youthOk" BOOLEAN NOT NULL DEFAULT true,
    "prehabNote" TEXT,
    "dosage" JSONB NOT NULL,
    "clipKey" TEXT NOT NULL,
    "videoUrl" TEXT,
    "imageRef" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "licence" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "reviewerId" TEXT,
    "reviewBatch" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibrarySubmission" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "programExerciseId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderatorId" TEXT,
    "moderatorNote" TEXT,
    "libraryExerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "LibrarySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramExercise_libraryExerciseId_idx" ON "ProgramExercise"("libraryExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryExercise_slug_key" ON "LibraryExercise"("slug");

-- CreateIndex
CREATE INDEX "LibraryExercise_reviewStatus_reviewBatch_idx" ON "LibraryExercise"("reviewStatus", "reviewBatch");

-- CreateIndex
CREATE INDEX "LibrarySubmission_status_createdAt_idx" ON "LibrarySubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LibrarySubmission_coachId_idx" ON "LibrarySubmission"("coachId");

-- AddForeignKey
ALTER TABLE "LibrarySubmission" ADD CONSTRAINT "LibrarySubmission_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibrarySubmission" ADD CONSTRAINT "LibrarySubmission_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
