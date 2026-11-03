-- GROUP-BOOKING (lane/group-booking, owner 2026-11-02: "book me or my trainers ... online and in person; people join my
-- groups in person, 5/6/7 pm, 6–8 people, 8 weeks, $65 a session or $400 for 2 a week, Fri/Sat make-ups"). Group classes
-- at three valley gyms, their seats, packages, make-ups and waitlist; in-person 1:1 sessions; the owner's trainers.
-- ADDITIVE ONLY: seven new tables, their indexes and two foreign keys between them. No existing table or column is
-- changed or dropped. No foreign key to "User" (user ids are plain text, like SessionJoinLink and the coach tables).
--
-- WHAT IS STORED, AND WHAT IS NOT.
--   GroupGym        — one row per gym the owner gave an address to: the gym id (lib/group-booking/config.ts GYMS holds the
--                     three names) and the address text the owner typed. No row = no address yet; the name shows alone.
--   GroupTrainer    — a trainer under the business owner: the owner's id, the trainer's account once they accept, a
--                     display name, a one-time invite code, the gyms they work at and their weekly hours (the coach-store
--                     WeeklyWindow shape), whether they take online / in-person 1:1, and a status ('invited' | 'active' |
--                     'removed'). Invited trainers are not bookable while GROUP_TRAINERS_BOOKABLE is off (the default).
--   GroupClass      — a group: name, home gym id, day pair ('mon_wed' | 'tue_thu'), hour (PT), the Monday of week 1, weeks,
--                     the min/max seats and the cut-off hours copied from config when it was made, the coach's decision
--                     when it is under the minimum ('run' | 'merge' | 'cancel'; NOTHING auto-cancels), and a status.
--   GroupPass       — what a person reserved: 'drop_in' (1 session), 'package' (8 over 4 weeks) or 'full' (two packages),
--                     the price shown, the pay mode ('at_gym' | 'online'), when the coach marked it paid in person and who.
--                     A money record (Privacy §10), so the account erase keeps it.
--   GroupSeat       — one person in one session: a regular session of a group, or a Friday/Saturday make-up slot at a gym
--                     ("slotKey"). Attendance ('booked' | 'present' | 'missed' | 'cancelled') and whether a cancel was late
--                     (counts as used). A make-up names the missed seat it makes up ("makeupForId", UNIQUE: one per miss).
--                     "seat" is the seat number in its slot, 1..max; UNIQUE ("slotKey", "seat") means a slot can never hold
--                     more people than seats, even if two people book the last one at the same instant (a cancelled seat
--                     gives its number back: seat = NULL). The app also takes a per-slot advisory lock.
--   GroupWaitlist   — a person waiting for a full group. No charge, no automatic move into a seat: the coach sees it.
--   InPersonSession — a 1:1 session in person at a gym: trainer, client, gym, start, minutes, price, pay mode, paid,
--                     attendance. "slotLock" (trainer + start, UNIQUE, NULL once cancelled) stops a double booking.
--   NO health data, NO address of any person, NO payment card data. Messages to a group go into the coach's EXISTING
--   program threads (ProgramMessage); nothing new is stored for them and nothing is emailed.
--
-- Written by hand in `prisma migrate diff --script` form; NO Prisma command was run, and prisma/schema.prisma and
-- public/_prisma/** are unchanged. NO schema.prisma model is needed: lib/group-booking/store.ts reads and writes these
-- tables with parameterised raw SQL behind lib/coach/pendingSchema.ts (the CreatorInquiry / PartyReport pattern), so
-- db-guard never applies this file (docs/DB-GUARD.md §8); the owner applies it by hand.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/group-booking/probe.ts probes information_schema for InPersonSession (created
-- last). Without it /groups, the share pages and the 1:1 booker say "Opens soon", the coach view says so too, every read
-- answers { available: false } and every write 503 group_booking_not_ready — nothing is written and nothing 500s. Within
-- ~5 minutes of applying, it is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4, OWNER-RUNBOOK.md §6):
--   1. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-11-02-group-booking.sql
--   2. Verify: /coach/groups shows the board (within ~5 minutes); add the gym addresses there.
--   (Optional, later) add models to prisma/schema.prisma and regenerate public/_prisma on Linux; the code does not need it.
--
-- ROLLBACK (loses every group, seat, pass, waitlist entry, trainer, gym address and in-person session):
--   DROP TABLE "InPersonSession"; DROP TABLE "GroupWaitlist"; DROP TABLE "GroupSeat"; DROP TABLE "GroupPass";
--   DROP TABLE "GroupClass"; DROP TABLE "GroupTrainer"; DROP TABLE "GroupGym";

-- CreateTable
CREATE TABLE "GroupGym" (
    "id" TEXT NOT NULL,
    "address" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupGym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTrainer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trainerUserId" TEXT,
    "displayName" TEXT NOT NULL,
    "inviteCode" TEXT,
    "gyms" JSONB NOT NULL DEFAULT '[]',
    "weeklyHours" JSONB NOT NULL DEFAULT '[]',
    "online" BOOLEAN NOT NULL DEFAULT true,
    "inPerson" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupClass" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "dayPair" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "minSeats" INTEGER NOT NULL,
    "maxSeats" INTEGER NOT NULL,
    "cutoffHours" INTEGER NOT NULL,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPass" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "startWeek" INTEGER NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "payMode" TEXT NOT NULL DEFAULT 'at_gym',
    "paidAt" TIMESTAMP(3),
    "markedPaidByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSeat" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "seat" INTEGER,
    "groupId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'regular',
    "makeupForId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupWaitlist" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InPersonSession" (
    "id" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "payMode" TEXT NOT NULL DEFAULT 'at_gym',
    "paidAt" TIMESTAMP(3),
    "markedPaidByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "slotLock" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InPersonSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupTrainer_inviteCode_key" ON "GroupTrainer"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "GroupTrainer_ownerId_trainerUserId_key" ON "GroupTrainer"("ownerId", "trainerUserId");

-- CreateIndex
CREATE INDEX "GroupClass_ownerId_status_idx" ON "GroupClass"("ownerId", "status");

-- CreateIndex
CREATE INDEX "GroupPass_groupId_status_idx" ON "GroupPass"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupPass_userId_idx" ON "GroupPass"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSeat_slotKey_seat_key" ON "GroupSeat"("slotKey", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "GroupSeat_makeupForId_key" ON "GroupSeat"("makeupForId");

-- CreateIndex
CREATE INDEX "GroupSeat_userId_startsAt_idx" ON "GroupSeat"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "GroupSeat_groupId_date_idx" ON "GroupSeat"("groupId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GroupWaitlist_groupId_userId_key" ON "GroupWaitlist"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InPersonSession_slotLock_key" ON "InPersonSession"("slotLock");

-- CreateIndex
CREATE INDEX "InPersonSession_trainerUserId_startsAt_idx" ON "InPersonSession"("trainerUserId", "startsAt");

-- CreateIndex
CREATE INDEX "InPersonSession_clientUserId_startsAt_idx" ON "InPersonSession"("clientUserId", "startsAt");

-- AddForeignKey
ALTER TABLE "GroupPass" ADD CONSTRAINT "GroupPass_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSeat" ADD CONSTRAINT "GroupSeat_passId_fkey" FOREIGN KEY ("passId") REFERENCES "GroupPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
