-- SAFETY (lane/safety, 2026-10-25; SAF-04, SAF-05): reports about people, the moderation that follows, its audit trail,
-- and the "Report a problem" inbox. ADDITIVE ONLY: four new tables and their indexes. Nothing existing is changed or
-- dropped. No foreign keys: like "PartyReport", these are raw-SQL tables (lib/safety/store.ts), and an erased account is
-- a tombstone, so the ids stay valid (lib/data-rights/registry.ts says what export and erase do with each column).
--
-- WHAT A ROW IS.
--   UserReport       one report by a signed-in person about a profile, a squad post, a challenge result or a coach
--                    message (lib/safety/reports.ts REPORT_TARGETS). reporterId = the session's account, never the body.
--                    reportedId = the person behind the target, resolved on the SERVER from the target (null when it
--                    cannot be). reason = a fixed preset id. note = optional, ONLY from a verified adult about a verified
--                    adult, screened (lib/safety/textScreen.ts) and capped at 280 characters — never from or about a
--                    minor. status open | actioned | dismissed; action = the moderation it led to, if any.
--   UserModeration   a warn, mute or ban on an account, with a preset reason, the admin who decided (moderatorId), when
--                    it ends (null = until lifted) and its APPEAL: appealStatus none | open | upheld | lifted, a preset
--                    appealReason, an optional appealNote (adults only, screened, capped). Never on "User": no
--                    schema.prisma edit for this lane.
--   ModerationAudit  one row per action anyone takes in the flow (report filed, warn/mute/ban, dismiss, appeal filed,
--                    appeal decided). actorId = who; subjectKind/subjectId = what; detail = preset fields only.
--   ProblemReport    a "Report a problem" from the support page: route (ids replaced by ":id"), build id, device
--                    class, the last game diagnostic's kind, the time, and typed text only from a verified adult
--                    (screened, capped). NO account id, NO email, NO address: nothing identifies who sent it.
--
-- Written by hand; no Prisma command was run, prisma/schema.prisma and public/_prisma/** are unchanged.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/safety/store.ts probes information_schema for each table
-- (lib/coach/pendingSchema.ts pendingProbe): without them a report answers { received: true, stored: false }, the admin
-- queue and inbox say "not set up yet", and nothing 500s. Within ~5 minutes of applying, reports land. No deploy.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add the four models to prisma/schema.prisma (without them, every later `migrate diff` proposes DROP TABLE):
--        model UserReport {
--          id         String    @id
--          reporterId String?
--          reportedId String?
--          targetKind String
--          targetRef  String
--          reason     String
--          note       String?
--          status     String    @default("open")
--          action     String?
--          reviewerId String?
--          reviewedAt DateTime?
--          createdAt  DateTime  @default(now())
--          @@index([status, createdAt])
--          @@index([reportedId])
--          @@index([reporterId, createdAt])
--        }
--        model UserModeration {
--          id              String    @id
--          userId          String
--          kind            String
--          reason          String
--          reportId        String?
--          moderatorId     String
--          createdAt       DateTime  @default(now())
--          endsAt          DateTime?
--          liftedAt        DateTime?
--          appealStatus    String    @default("none")
--          appealReason    String?
--          appealNote      String?
--          appealedAt      DateTime?
--          appealDecidedAt DateTime?
--          @@index([userId, createdAt])
--          @@index([appealStatus])
--        }
--        model ModerationAudit {
--          id          String   @id
--          actorId     String?
--          action      String
--          subjectKind String
--          subjectId   String
--          detail      String?
--          createdAt   DateTime @default(now())
--          @@index([subjectKind, subjectId])
--          @@index([createdAt])
--        }
--        model ProblemReport {
--          id          String    @id
--          route       String
--          buildId     String
--          deviceClass String
--          diagKind    String?
--          clientAt    DateTime?
--          text        String?
--          status      String    @default("new")
--          createdAt   DateTime  @default(now())
--          @@index([status, createdAt])
--        }
--   2. Preview, read-only: npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      It should print exactly the statements below (plus anything another unapplied lane adds — stop and review if so).
--   3. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-user-reports.sql
--   4. Verify: the same migrate diff prints an empty migration.
--   5. Then the client, as the other pending files describe, committed together.
--
-- RETENTION: an OWNER CALL (docs/TEEN-SAFE-AUDIT.md; party reports are 12 months by the owner's 2026-10-13 decision).
-- Nothing deletes these rows automatically yet.
--
-- ROLLBACK (loses every report, moderation, audit row and problem report):
--   DROP TABLE "ProblemReport"; DROP TABLE "ModerationAudit"; DROP TABLE "UserModeration"; DROP TABLE "UserReport";

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportedId" TEXT,
    "targetKind" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "action" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModeration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reportId" TEXT,
    "moderatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "appealStatus" TEXT NOT NULL DEFAULT 'none',
    "appealReason" TEXT,
    "appealNote" TEXT,
    "appealedAt" TIMESTAMP(3),
    "appealDecidedAt" TIMESTAMP(3),

    CONSTRAINT "UserModeration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "deviceClass" TEXT NOT NULL,
    "diagKind" TEXT,
    "clientAt" TIMESTAMP(3),
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_reportedId_idx" ON "UserReport"("reportedId");

-- CreateIndex
CREATE INDEX "UserReport_reporterId_createdAt_idx" ON "UserReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "UserModeration_userId_createdAt_idx" ON "UserModeration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserModeration_appealStatus_idx" ON "UserModeration"("appealStatus");

-- CreateIndex
CREATE INDEX "ModerationAudit_subjectKind_subjectId_idx" ON "ModerationAudit"("subjectKind", "subjectId");

-- CreateIndex
CREATE INDEX "ModerationAudit_createdAt_idx" ON "ModerationAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_status_createdAt_idx" ON "ProblemReport"("status", "createdAt");
