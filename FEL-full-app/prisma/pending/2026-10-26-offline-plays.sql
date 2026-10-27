-- OFFLINE-PUSH (lane offline-push, 2026-10-26; owner QUALITY 2026-10-20: "graceful offline (single-player + downloaded
-- lessons offline via PWA, sync later, clear offline messages)").
-- ADDITIVE ONLY: one new table, its indexes and one foreign key. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   OfflinePlay — one row per single-player run played with no signal and sent when the signal came back: the mode, the
--                 score, the win, how long it lasted, when it was played, and the device's own id for the run (so a
--                 re-send is recorded once). PRACTICE ONLY: it is NOT a GameSession. The server never started or timed
--                 the run (ECONOMY-SESSIONS-HARDEN: every paid run finishes a run the server started), so an offline run
--                 pays nothing — no XP, coins, Lab Credits, streak, PRQ, season XP, mastery or Arena score — and no score
--                 reader (the Arena's rival draw, season XP, the wallet's session earn) ever reads this table.
--                 Only runs of the offline-play pages (lib/pwa/offlinePlay.ts) are accepted, played in the last 14 days.
--                 Teens' runs are kept like their GameSessions (owner 2026-10-20: "Teen data: training only (set logs,
--                 sessions, goals, program progress)").
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-26-vbt.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/pwa/offlineResults.ts probes information_schema for OfflinePlay: without the
-- table POST /api/offline/results answers 503 not_ready and the phone keeps the runs queued (lib/offline-cache.ts) until it
-- is applied. Within ~5 minutes of applying, queued runs land on the next reconnect.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model OfflinePlay {
--          id          String   @id
--          userId      String
--          /// The device's id for the run (lib/offline-cache.ts clientId; not named clientId, which is a coach's athlete elsewhere): one row per run, however often it is sent.
--          runKey      String
--          mode        String
--          score       Int
--          won         Boolean  @default(false)
--          durationSec Int      @default(0)
--          playedAt    DateTime
--          createdAt   DateTime @default(now())
--          user        User     @relation("OfflinePlays", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@unique([userId, runKey])
--          @@index([userId, playedAt])
--        }
--
--      and the back-relation on model User: `offlinePlays OfflinePlay[] @relation("OfflinePlays")`.
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-offline-plays.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): kept like GameSession (until the account goes; cascade). In lib/data-rights/registry.ts
-- (export and erase).
--
-- ROLLBACK (loses every synced offline run): DROP TABLE "OfflinePlay";

-- CreateTable
CREATE TABLE "OfflinePlay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflinePlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflinePlay_userId_runKey_key" ON "OfflinePlay"("userId", "runKey");

-- CreateIndex
CREATE INDEX "OfflinePlay_userId_playedAt_idx" ON "OfflinePlay"("userId", "playedAt");

-- AddForeignKey
ALTER TABLE "OfflinePlay" ADD CONSTRAINT "OfflinePlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
