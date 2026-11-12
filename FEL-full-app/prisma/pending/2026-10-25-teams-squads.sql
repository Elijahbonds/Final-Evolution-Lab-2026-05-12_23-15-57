-- TEAMS-SQUADS (lane/teams-squads, 2026-10-25; value round "lane/teams" + friends round "lane/squads", owner 2026-10-22,
-- and docs/COACH-LOOP.md §3 "Named groups", owner 2026-10-23: yes). One shared core for a coach-led TEAM and a friends'
-- SQUAD (coach optional): the group, its members with a role, and the group's preset-only acts (reactions, nudges, duo
-- goals, posted challenges, the weekly league's trophies).
-- ADDITIVE ONLY: three new tables, their indexes and six foreign keys. No existing table or column is changed or dropped.
--
-- BUILDS ON COACH-LOOP §3 (it proposed CoachGroup + CoachGroupMember and wrote no file). Same decisions, one table pair
-- for both kinds: CoachGroup = TrainingGroup with kind 'team' (ownerId = the coach; unique name per owner and kind), and
-- CoachGroupMember = TrainingGroupMember. §3's roster rule is kept IN CODE: a team member counts on the coach's views only
-- while their CoachClient row is live (endedAt null), so leaving the roster drops them from every team without a cascade.
--
-- WHAT IS STORED, AND WHAT IS NOT.
--   TrainingGroup        — kind ('team' | 'squad'), owner, name (a squad's name is picked from preset words, never typed;
--                          a team's is typed by its certified coach), colour (a preset key), an optional home court (a
--                          venue key, 'venue:<key>'), the invite token (`CODE~<random>`, the coach invite's shape:
--                          lib/coach/inviteCode.ts), whether the invite is open, and whether the coach assigned the daily
--                          drill to the team.
--   TrainingGroupMember  — one row per member: role ('owner' | 'coach' | 'member') and shareMeasured (an adult's own opt-in
--                          to show their measured reps and verified jumps to this group; default off, never on for a minor).
--   TrainingGroupAct     — one row per preset act. There is NO free-text column: `preset` holds a key from a fixed list
--                          (lib/groups/types.ts), `ref` an event key, a ChallengeLink code or a week key. dedupeKey makes each
--                          act once-only (one reaction of a kind per person per event, one nudge per pair per day, one duo
--                          goal per pair per week, one trophy row per week).
-- No message, comment, chat or DM column exists anywhere, by design: reactions only (owner, 2026-10-22).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-24-coach-ai-draft.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/groups/store.ts probes information_schema for the tables: without them
-- /squads says "coming soon", GET /api/groups answers { available: false } and every write answers 503 groups_not_ready.
-- Nothing 500s. Within ~5 minutes of applying, squads and teams are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model TrainingGroup {
--          id          String   @id
--          /// 'team' | 'squad'.
--          kind        String
--          ownerId     String
--          name        String
--          /// A preset colour key (lib/groups/types.ts GROUP_COLORS).
--          color       String
--          /// 'venue:<key>' (lib/game-data VENUES), or null.
--          homeCourt   String?
--          /// CODE~random, the coach invite token's shape.
--          inviteToken String   @unique
--          inviteOpen  Boolean  @default(true)
--          /// A team's coach assigned the daily drill to everyone.
--          dailyDrill  Boolean  @default(false)
--          createdAt   DateTime @default(now())
--          owner       User     @relation("TrainingGroupsOwned", fields: [ownerId], references: [id], onDelete: Cascade)
--          members     TrainingGroupMember[]
--          acts        TrainingGroupAct[]
--
--          @@unique([ownerId, kind, name])
--        }
--
--        model TrainingGroupMember {
--          groupId       String
--          userId        String
--          /// 'owner' | 'coach' | 'member'.
--          role          String
--          shareMeasured Boolean  @default(false)
--          joinedAt      DateTime @default(now())
--          group         TrainingGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
--          user          User          @relation("TrainingGroupMemberships", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@id([groupId, userId])
--          @@index([userId])
--        }
--
--        model TrainingGroupAct {
--          id         String   @id
--          groupId    String
--          /// 'reaction' | 'nudge' | 'duo' | 'challenge' | 'trophy'.
--          kind       String
--          dedupeKey  String
--          fromUserId String?
--          toUserId   String?
--          ref        String?
--          /// A key from a fixed list; never free text.
--          preset     String?
--          points     Int?
--          createdAt  DateTime @default(now())
--          group      TrainingGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
--          fromUser   User?         @relation("TrainingGroupActsFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
--          toUser     User?         @relation("TrainingGroupActsTo", fields: [toUserId], references: [id], onDelete: Cascade)
--
--          @@unique([groupId, dedupeKey])
--          @@index([groupId, kind, createdAt])
--        }
--
--      and the back-relations on model User:
--        trainingGroupsOwned      TrainingGroup[]       @relation("TrainingGroupsOwned")
--        trainingGroupMemberships TrainingGroupMember[] @relation("TrainingGroupMemberships")
--        trainingGroupActsFrom    TrainingGroupAct[]    @relation("TrainingGroupActsFrom")
--        trainingGroupActsTo      TrainingGroupAct[]    @relation("TrainingGroupActsTo")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-teams-squads.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ACCOUNT DELETION: every row naming a user cascades with the User row (owner → the group and all of it; member → the
-- membership; from/to → the act).
--
-- ROLLBACK (loses every group, membership, reaction, nudge, duo goal, posted challenge link and trophy; the challenges
-- themselves, drills and games are untouched): DROP TABLE "TrainingGroupAct"; DROP TABLE "TrainingGroupMember"; DROP TABLE "TrainingGroup";

-- CreateTable
CREATE TABLE "TrainingGroup" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "homeCourt" TEXT,
    "inviteToken" TEXT NOT NULL,
    "inviteOpen" BOOLEAN NOT NULL DEFAULT true,
    "dailyDrill" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "shareMeasured" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "TrainingGroupAct" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "ref" TEXT,
    "preset" TEXT,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingGroupAct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingGroup_inviteToken_key" ON "TrainingGroup"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingGroup_ownerId_kind_name_key" ON "TrainingGroup"("ownerId", "kind", "name");

-- CreateIndex
CREATE INDEX "TrainingGroupMember_userId_idx" ON "TrainingGroupMember"("userId");

-- CreateIndex
CREATE INDEX "TrainingGroupAct_groupId_kind_createdAt_idx" ON "TrainingGroupAct"("groupId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingGroupAct_groupId_dedupeKey_key" ON "TrainingGroupAct"("groupId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "TrainingGroup" ADD CONSTRAINT "TrainingGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroupMember" ADD CONSTRAINT "TrainingGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroupMember" ADD CONSTRAINT "TrainingGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroupAct" ADD CONSTRAINT "TrainingGroupAct_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroupAct" ADD CONSTRAINT "TrainingGroupAct_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroupAct" ADD CONSTRAINT "TrainingGroupAct_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
