-- KNOWLEDGE-FEED v2 (2026-10-06, owner decision 2 "Account sync: YES"): the LearnProfile and LearnCard tables
-- (schema.prisma models LearnProfile, LearnCard) — /learn progress for signed-in, verified-adult accounts.
-- ADDITIVE ONLY: two new tables, one index, two foreign keys to "User" (ON DELETE CASCADE). No existing table or column
-- is changed or dropped. (User gains two Prisma relation fields, learnProfile and learnCards; they are not columns.)
--
-- Written by hand in `prisma migrate diff --script` form. The owner's rule for this lane was "never run prisma
-- migrate / db push or any DB command", so no prisma migrate subcommand was run, not even the offline diff. The
-- owner's preview step below is what checks it against production:
--   npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
-- should print exactly these statements (plus anything another unapplied lane adds — stop and review if so).
--
-- ORDER: apply BEFORE the deploy that contains this lane — then sync works from the first request. A deploy that runs
-- first does not 500: every /api/learn route catches the missing table and answers 503 learn_sync_unavailable, and
-- the feed stays on the device (lib/knowledge/syncClient.ts treats a 503 as "not now").
-- Applying it is the owner's step: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-06-knowledge-feed.sql
-- then the same migrate diff prints an empty migration.
--
-- ROLLBACK (drops the synced learning progress; account XP already credited stays in PlayerProfile.xp):
--   DROP TABLE "LearnCard"; DROP TABLE "LearnProfile";

-- CreateTable
CREATE TABLE "LearnProfile" (
    "userId" TEXT NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likes" JSONB NOT NULL DEFAULT '{}',
    "less" JSONB NOT NULL DEFAULT '{}',
    "dwell" JSONB NOT NULL DEFAULT '{}',
    "liked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "streakBest" INTEGER NOT NULL DEFAULT 0,
    "streakLastDay" INTEGER,
    "todayDay" INTEGER NOT NULL DEFAULT -1,
    "todayDone" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accountXpDay" INTEGER NOT NULL DEFAULT -1,
    "accountXpToday" INTEGER NOT NULL DEFAULT 0,
    "goalBonusDay" INTEGER NOT NULL DEFAULT -1,
    "devices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LearnCard" (
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "firstDay" INTEGER NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "box" INTEGER,
    "dueDay" INTEGER,
    "right" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "lastAnsweredDay" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnCard_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateIndex
CREATE INDEX "LearnCard_userId_dueDay_idx" ON "LearnCard"("userId", "dueDay");

-- AddForeignKey
ALTER TABLE "LearnProfile" ADD CONSTRAINT "LearnProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnCard" ADD CONSTRAINT "LearnCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
