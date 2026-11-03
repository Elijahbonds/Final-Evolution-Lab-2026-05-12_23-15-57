-- HOOPS-CAM (BBS-04, platform lane plat-bbs04, 2026-11-03): an adult's shot and dribble sessions from the phone camera,
-- kept so a coach can see a per-athlete shot chart in the team panel and on /coach/shots.
-- ADDITIVE ONLY: one new table, one index and one foreign key. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   HoopsCamSession — one row per camera session: its kind ('shots' | 'dribble'), the athlete's own calendar day
--                     ('YYYY-MM-DD'), when it started, and its NUMBERS as JSON (lib/hoops-cam/log.ts cleanSession: per
--                     shot the time into the session, made or not, whether the player fixed the call, and an approximate
--                     court spot in metres; per dribble session the count, crossovers, hands, rate and rhythm). NUMBERS
--                     ONLY: never a frame, a landmark, a picture or a video (the camera picture never leaves the phone).
--                     Written ONLY for a verified adult who opted in to saving movement numbers (lib/privacy/
--                     scanSaveGate.ts canSaveScanNumbers, row 1o); everyone else keeps sessions on their phone, and a
--                     13–17 player's sessions are kept nowhere (lib/hoops-cam/gate.ts TEEN_SHOT_SAVE).
--   A coach reads them only on the VBT rule: a live roster link + a live coach_view grant + a verified adult who opted in,
--   or, in a team the coach runs, an adult who can save AND turned on "share measured" (lib/hoops-cam/server.ts).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-26-vbt.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/hoops-cam/store.ts probes information_schema for HoopsCamSession: without the
-- table the tracker runs as it does today (sessions kept on the phone), the coach's shot charts stay dark (the team panel
-- shows nothing new; /coach/shots says it opens when the table is applied) and POST answers 503. Within ~5 minutes of
-- applying, saving and the coach's charts are on, with no deploy.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model HoopsCamSession {
--          id        String   @id
--          userId    String
--          /// 'shots' | 'dribble'.
--          kind      String
--          /// The athlete's own calendar day, 'YYYY-MM-DD'.
--          day       String
--          startedAt DateTime
--          /// lib/hoops-cam/log.ts cleanSession's numbers (never a frame).
--          data      Json
--          createdAt DateTime @default(now())
--          user      User     @relation("HoopsCamSessions", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([userId, createdAt])
--        }
--
--      and the back-relation on model User: `hoopsCamSessions HoopsCamSession[] @relation("HoopsCamSessions")`.
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-11-03-hoops-cam.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): kept until the athlete deletes it (DELETE /api/hoops-cam/sessions removes every session of
-- theirs) or the account goes (cascade). In lib/data-rights/registry.ts (export and erase).
--
-- ROLLBACK (loses every saved session): DROP TABLE "HoopsCamSession";

-- CreateTable
CREATE TABLE "HoopsCamSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoopsCamSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoopsCamSession_userId_createdAt_idx" ON "HoopsCamSession"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "HoopsCamSession" ADD CONSTRAINT "HoopsCamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
