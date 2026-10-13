-- CREATOR PLATFORM (PR #18, feature/creator-platform; owner decision 2026-10-13, "inquiries to Postgres through pending
-- SQL"): CreatorInquiry — one row per "Work with us" / media-kit / team-profile inquiry.
-- ADDITIVE ONLY: one new table and one index. No existing table or column is changed or dropped, no foreign key.
--
-- Written by hand in `prisma migrate diff --script` form; NO Prisma command was run, and prisma/schema.prisma and
-- public/_prisma/** are unchanged. NO schema.prisma model is needed: lib/creator/inquiryStore.ts reads and writes this
-- table with parameterised raw SQL (lib/coach/pendingSchema.ts, the same pattern as CoachAvailability), so the owner
-- does NOT have to add a model or regenerate the client for the form to work.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. inquiryStore probes information_schema for the table. Without it /work-with-us
-- says "Inquiries are unavailable right now" instead of showing the form, and POST /api/creator/inquiry answers 503
-- inquiries_unavailable (nothing is stored). Within ~5 minutes of applying this, the form is on.
--
-- WHAT IS STORED: brand, contact name, email, budget range, dates, deliverables, message, the page it came from
-- ('work-with-us' | 'media-kit' | 'team-profile'), the approved team profile slug if any, a status ('NEW'), and the time.
-- NO IP address and NO IP hash (the salted hash and CREATOR_IP_SALT were dropped). Retention: 365 days
-- (INQUIRY_RETENTION_DAYS in lib/creator/inquiryStore.ts, stated in the privacy policy). The app deletes expired rows
-- every time an inquiry is saved; to delete them by hand:
--     DELETE FROM "CreatorInquiry" WHERE "createdAt" < ((NOW() AT TIME ZONE 'UTC') - make_interval(days => 365));
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-13-creator-inquiry.sql
--   2. Verify: the form on /work-with-us appears (within ~5 minutes), and a test inquiry lands in "CreatorInquiry".
--   (Optional, later) add a model to prisma/schema.prisma and regenerate public/_prisma on Linux; the code does not need it.
--
-- ROLLBACK (drops every stored inquiry; nothing else depends on it): DROP TABLE "CreatorInquiry";

-- CreateTable
CREATE TABLE "CreatorInquiry" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "budgetRange" TEXT NOT NULL,
    "dates" TEXT NOT NULL DEFAULT '',
    "deliverables" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "profileSlug" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorInquiry_createdAt_idx" ON "CreatorInquiry"("createdAt");
