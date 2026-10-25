-- VBT (lane vbt, 2026-10-25; owner decisions 2026-10-25: camera-only velocity-based training for barbell, dumbbell and
-- kettlebell, body-only moves and med-ball throws; coaches set velocity zones; no accuracy claim before the pilot).
-- ADDITIVE ONLY: two new tables, their indexes and three foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   VbtSet        — one row per tracked set: the lift, the load, the athlete's own calendar day ('YYYY-MM-DD'), where the
--                   bar was read (the plate or the pose), the frame rate, the counted and partial rep counts, the best /
--                   mean / last mean concentric velocity, the best peak velocity, the velocity loss, the stop line, each
--                   counted rep's velocity (or each throw's release speed), and — for a warm-up readiness set — that
--                   day's band. NUMBERS ONLY: never a frame, a landmark, a picture or a video (the video never leaves the
--                   phone). Written ONLY for a verified adult who opted in to saving movement numbers (lib/privacy/
--                   scanSaveGate.ts canSaveScanNumbers, row 1n); everyone else keeps sets on their phone, and a 13–17
--                   athlete's sets are kept nowhere (lib/vbt/gate.ts).
--   VbtZoneTarget — a coach's velocity zone for one exercise slot of a program (SessionExercise): the zone id
--                   (lib/vbt/lifts.ts ZONE_IDS) and the velocity-loss stop line in %. Unique per slot.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-25-coach-readiness.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/vbt/store.ts probes information_schema for VbtZoneTarget (created last):
-- without the tables the tool still runs, sets are kept on the phone, coaches see no client sets and the zone editor
-- says it opens when the tables are applied. Within ~5 minutes of applying, saving, the coach's view and zones are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model VbtSet {
--          id        String   @id
--          userId    String
--          /// The athlete's own calendar day, 'YYYY-MM-DD'.
--          day       String
--          /// lib/vbt/lifts.ts LIFT_IDS.
--          lift      String
--          loadKg    Float?
--          /// 'plate' | 'pose'.
--          source    String
--          fps       Float
--          reps      Int
--          partials  Int      @default(0)
--          bestMcv   Float?
--          meanMcv   Float?
--          lastMcv   Float?
--          bestPv    Float?
--          lossPct   Float?
--          stopPct   Float
--          repMcvs   Float[]  @default([])
--          warmup    Boolean  @default(false)
--          /// 'ready' | 'normal' | 'low' | 'building' for a warm-up readiness set.
--          band      String?
--          createdAt DateTime @default(now())
--          user      User     @relation("VbtSets", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([userId, createdAt])
--          @@index([userId, lift])
--        }
--
--        model VbtZoneTarget {
--          id                String          @id
--          coachId           String
--          sessionExerciseId String          @unique
--          /// lib/vbt/lifts.ts ZONE_IDS.
--          zone              String
--          lossStopPct       Float
--          updatedAt         DateTime        @default(now())
--          coach             User            @relation("VbtZoneTargets", fields: [coachId], references: [id], onDelete: Cascade)
--          sessionExercise   SessionExercise @relation(fields: [sessionExerciseId], references: [id], onDelete: Cascade)
--        }
--
--      and the back-relations: on model User `vbtSets VbtSet[] @relation("VbtSets")` and
--      `vbtZoneTargets VbtZoneTarget[] @relation("VbtZoneTargets")`; on model SessionExercise `vbtZoneTarget VbtZoneTarget?`.
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-vbt.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): kept until the athlete deletes it (DELETE /api/vbt/sets removes every set of theirs) or the
-- account goes (cascade). Both tables are in lib/data-rights/registry.ts (export and erase).
--
-- ROLLBACK (loses every set and zone): DROP TABLE "VbtZoneTarget"; DROP TABLE "VbtSet";

-- CreateTable
CREATE TABLE "VbtSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "lift" TEXT NOT NULL,
    "loadKg" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "fps" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "partials" INTEGER NOT NULL DEFAULT 0,
    "bestMcv" DOUBLE PRECISION,
    "meanMcv" DOUBLE PRECISION,
    "lastMcv" DOUBLE PRECISION,
    "bestPv" DOUBLE PRECISION,
    "lossPct" DOUBLE PRECISION,
    "stopPct" DOUBLE PRECISION NOT NULL,
    "repMcvs" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "warmup" BOOLEAN NOT NULL DEFAULT false,
    "band" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VbtSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VbtZoneTarget" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "lossStopPct" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VbtZoneTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VbtSet_userId_createdAt_idx" ON "VbtSet"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VbtSet_userId_lift_idx" ON "VbtSet"("userId", "lift");

-- CreateIndex
CREATE UNIQUE INDEX "VbtZoneTarget_sessionExerciseId_key" ON "VbtZoneTarget"("sessionExerciseId");

-- AddForeignKey
ALTER TABLE "VbtSet" ADD CONSTRAINT "VbtSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VbtZoneTarget" ADD CONSTRAINT "VbtZoneTarget_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VbtZoneTarget" ADD CONSTRAINT "VbtZoneTarget_sessionExerciseId_fkey" FOREIGN KEY ("sessionExerciseId") REFERENCES "SessionExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
