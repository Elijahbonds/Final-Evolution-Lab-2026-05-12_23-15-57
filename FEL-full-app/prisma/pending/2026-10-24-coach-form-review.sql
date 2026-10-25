-- COACH-VIDEO-REVIEW (2026-10-24; owner lane order item 3, "the camera counts reps and flags the bad one"): a client's
-- recorded set, sent to their coach as POSE DATA ONLY, and the coach's reviewed / unreviewed state on it.
-- ADDITIVE ONLY: one new table, two indexes and three foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED (one row per set a client sends):
--   who        clientId, coachId, programId (the coach's program the set was for), sessionExerciseId (the slot, or null)
--   what       exerciseName, movement ('squat' | 'lunge' | 'hinge' | 'pushup'), band ('adult' | 'teen' — teens are gated
--              OFF in code, lib/coach/formReview/gate.ts TEEN_POSE_REVIEW_ENABLED), reps, setScore (0–100 or null),
--              flagCount, summary (JSON: each rep's window, faults, side and score, the flags, the camera's aspect)
--   the pose   tracks (JSON: 17 image keypoints per frame, x/y in thousandths of the frame and visibility, 20 fps, for at
--              most 4 reps — the flagged ones and the best one). NO VIDEO, NO IMAGE, NO AUDIO: the route refuses any field
--              outside the pose shape (lib/coach/formReview/payload.ts parseSubmission).
--   the state  status ('unreviewed' | 'reviewed'), reviewedAt, replyMessageId (the ProgramMessage the coach's reply posted)
--
-- RETENTION (owner call, docs/COACH-VIDEO-REVIEW.md §6): "tracksDeleteAt" is createdAt + 90 days. After it the keypoint
-- tracks are set to NULL (lib/coach/formReview/store.ts purgeExpiredTracks, run on the coach's queue reads — no cron
-- needed); the numbers (scores, faults, reviewed state) stay for the trend until the client deletes the set
-- (DELETE /api/coach/form-reviews/[id]) or the account is erased (the foreign keys cascade).
--
-- Who may write a row is decided in code, before the INSERT (lib/coach/formReview/gate.ts): a live CoachClient link to the
-- program's coach, the teen gate, and for adults lib/privacy/scanSaveGate.ts canSaveScanNumbers (verified 18+ AND the
-- AB-04 opt-in). The route is row 1k of SCAN_SAVE_ROUTES.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-07-coach-ai-2-coach-availability.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach/formReview/store.ts probes information_schema for the table: without it
-- the client still records a set and reads its flags on the phone, the send answers 503 form_review_not_ready (the page
-- says sending is not open yet), and the coach's queue says the same with a count of 0. Within ~5 minutes of applying, it
-- is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model CoachFormReview {
--          id                String    @id
--          clientId          String
--          coachId           String
--          programId         String
--          sessionExerciseId String?
--          exerciseName      String
--          /// 'squat' | 'lunge' | 'hinge' | 'pushup'.
--          movement          String
--          /// 'adult' | 'teen'.
--          band              String
--          reps              Int
--          setScore          Int?
--          flagCount         Int
--          summary           Json
--          /// Pose keypoints only; NULL after tracksDeleteAt.
--          tracks            Json?
--          tracksDeleteAt    DateTime
--          /// 'unreviewed' | 'reviewed'.
--          status            String    @default("unreviewed")
--          reviewedAt        DateTime?
--          replyMessageId    String?
--          createdAt         DateTime  @default(now())
--          client            User            @relation("FormReviewsSent", fields: [clientId], references: [id], onDelete: Cascade)
--          coach             User            @relation("FormReviewsReceived", fields: [coachId], references: [id], onDelete: Cascade)
--          program           CoachingProgram @relation(fields: [programId], references: [id], onDelete: Cascade)
--
--          @@index([coachId, status, createdAt])
--          @@index([clientId, movement, createdAt])
--        }
--
--      and the back-relations:  model User { formReviewsSent CoachFormReview[] @relation("FormReviewsSent")
--                                            formReviewsReceived CoachFormReview[] @relation("FormReviewsReceived") }
--                               model CoachingProgram { formReviews CoachFormReview[] }
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below (plus any other unapplied pending file — stop and review if so).
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-24-coach-form-review.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say,
--      and bump PARENT in lib/privacy/u13-lock-log.test.ts to that commit.
--
-- ROLLBACK (loses every sent set and its reviewed state; the coach's replies stay, they are ordinary thread messages):
--   DROP TABLE "CoachFormReview";

-- CreateTable
CREATE TABLE "CoachFormReview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sessionExerciseId" TEXT,
    "exerciseName" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "reps" INTEGER NOT NULL,
    "setScore" INTEGER,
    "flagCount" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "tracks" JSONB,
    "tracksDeleteAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unreviewed',
    "reviewedAt" TIMESTAMP(3),
    "replyMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachFormReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachFormReview_coachId_status_createdAt_idx" ON "CoachFormReview"("coachId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CoachFormReview_clientId_movement_createdAt_idx" ON "CoachFormReview"("clientId", "movement", "createdAt");

-- AddForeignKey
ALTER TABLE "CoachFormReview" ADD CONSTRAINT "CoachFormReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFormReview" ADD CONSTRAINT "CoachFormReview_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFormReview" ADD CONSTRAINT "CoachFormReview_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CoachingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
