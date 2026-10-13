-- PARTY-CHAT (2026-10-13; owner decision "PSN-style party": "everyone can mute, block, report"): PartyReport.
-- There was no moderation table for reports about PEOPLE (the creator review queue reviews cards), so this is new.
-- ADDITIVE ONLY: one new table and two indexes. Nothing existing is changed or dropped.
--
-- What a row is: one report of one party member by another. Account ids come from netd's sealed report slip
-- (server/netd/src/ticket.ts sealSlip), never from a request body. NO MESSAGE CONTENT: party chat is relayed and never
-- stored anywhere, so a report carries the fixed reason id only (harassment | hate | sexual | threat | cheating | other).
-- reporterId is null for a guest reporter; reportedId is null when the reported person was a guest.
--
-- Written by hand. This lane ran no Prisma command (no migrate, no db push, no generate) and did NOT change
-- prisma/schema.prisma or public/_prisma/**.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/party/social/reports.ts writes with raw, parameterised SQL after an
-- information_schema probe (lib/coach/pendingSchema.ts): without the table a report answers {stored:false} and the
-- person's block still works; within ~5 minutes of this file being applied, reports land. No deploy, no env change.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4), in this order:
--   1. Locally, add the model to prisma/schema.prisma (without it, every later `migrate diff` proposes DROP TABLE):
--        model PartyReport {
--          id           String   @id
--          reporterId   String?
--          reportedId   String?
--          reportedName String
--          partyCode    String
--          reason       String
--          reportedAt   DateTime
--          createdAt    DateTime @default(now())
--          @@index([reportedId])
--          @@index([createdAt])
--        }
--   2. Preview, read-only: npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      It should print exactly the statements below (plus anything another unapplied lane adds — stop and review if so).
--   3. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-13-party-report.sql
--   4. Verify: the same migrate diff prints an empty migration.
--   5. Then the client, as the other pending files describe (copy-prisma-schema, prisma:generate, the schema-sync and
--      prisma-artifact tests), committed together.
--
-- RETENTION (owner, 2026-10-13: 12 months, with automatic deletion; lib/policies.ts tells the player the same): a report is
-- deleted 365 days after it was filed. lib/party/social/reports.ts runs the statement below after every saved report (the
-- creator inquiries' pattern), and is a no-op until this table exists. There is no scheduler in this repo, so on a quiet
-- stretch an old report waits for the next report; to clear it sooner run this by hand, or from a scheduled job if you
-- add one. "createdAt" is already indexed below ("PartyReport_createdAt_idx"), so no column or index was added:
--     DELETE FROM "PartyReport" WHERE "createdAt" < (CURRENT_TIMESTAMP - make_interval(days => 365));
-- ROLLBACK (loses the reports): DROP TABLE "PartyReport";

-- CreateTable
CREATE TABLE "PartyReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportedId" TEXT,
    "reportedName" TEXT NOT NULL,
    "partyCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyReport_reportedId_idx" ON "PartyReport"("reportedId");

-- CreateIndex
CREATE INDEX "PartyReport_createdAt_idx" ON "PartyReport"("createdAt");
