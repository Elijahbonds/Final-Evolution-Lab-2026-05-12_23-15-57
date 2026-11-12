-- TIP-GUEST-TOKEN-HASH, file 1 of 2 (2026-10-19): hash the guest token at rest. ADDITIVE: one nullable column, one
-- unique index, and two in-place backfills. Nothing is dropped.
--
-- Written by hand and NOT RUN: no Prisma command (no migrate, no db push, no generate), no dry run on any database.
-- prisma/schema.prisma and public/_prisma/** are unchanged on purpose: the `tokenHash String? @unique` line is held for
-- TIP-SCHEMA-SYNC-DOB-TOKENHASH. Until then the app reaches "tokenHash" only through parameterised raw SQL after an
-- information_schema probe (lib/guestSession.ts), so this file is SAFE IN EITHER ORDER WITH THE DEPLOY:
--   · code deployed, this file not applied: new GuestSession rows store "token" = sha256 hex of the cookie, and lookup is
--     "token" = hash. A pre-hash row (raw token) is not found; that guest gets a fresh session (guest rows hold no score).
--   · this file applied: within ~5 minutes (the probe's TTL) lookup becomes "tokenHash" = hash OR "token" = hash, so the
--     pre-hash rows backfilled below are found again, and new rows stamp "tokenHash" too.
--
-- Requires PostgreSQL 11+ for the built-in sha256(bytea) (no extension). Confirm the Cloud SQL version before applying.
-- Every prod step needs Elijah's yes and is applied by AM after a backup (docs/LANES.md section 4).

ALTER TABLE "GuestSession" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

-- A row the new code wrote already holds the hash in "token" (64 lowercase hex); a raw token is 32 base64url characters
-- and can never look like that. Copy a hash as it is, hash a raw token, so no row is ever hashed twice.
UPDATE "GuestSession"
   SET "tokenHash" = CASE WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
                          ELSE encode(sha256(convert_to("token", 'UTF8')), 'hex') END
 WHERE "tokenHash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- Analytics rows written before the deploy carry the raw cookie as guestId. The same per-guest hash keeps funnel joins
-- working; rows already holding a hash are left alone.
UPDATE "AnalyticsEvent"
   SET "guestId" = encode(sha256(convert_to("guestId", 'UTF8')), 'hex')
 WHERE "guestId" IS NOT NULL AND "guestId" !~ '^[0-9a-f]{64}$';

-- Checks after applying (both expected 0):
--   SELECT count(*) FROM "GuestSession" WHERE "tokenHash" IS NULL;
--   SELECT count(*) FROM "AnalyticsEvent" WHERE "guestId" IS NOT NULL AND "guestId" !~ '^[0-9a-f]{64}$';
