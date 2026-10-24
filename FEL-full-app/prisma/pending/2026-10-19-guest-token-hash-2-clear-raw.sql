-- TIP-GUEST-TOKEN-HASH, file 2 of 2 (2026-10-19): remove the last raw guest tokens. Apply ONLY after file 1
-- (2026-10-19-guest-token-hash-1-add.sql) is applied AND the hashing code is confirmed live in production.
--
-- Written by hand and NOT RUN: no Prisma command, no dry run on any database. Elijah's yes, then AM after a backup.
--
-- After this, "token" and "tokenHash" hold the same hash on every row, so the app's lookup ("tokenHash" = hash OR
-- "token" = hash, lib/guestSession.ts) matches either way, and nothing in the database can be replayed as a cookie.
-- Dropping "token" is a later schema change (with TIP-SCHEMA-SYNC-DOB-TOKENHASH or after it), not this file.

-- Rows created between file 1 and the app's probe noticing the column (up to ~5 minutes) hold the hash in "token" but
-- no "tokenHash" yet. Stamp them first, with the same no-double-hash rule as file 1, so the copy below never writes NULL
-- into the NOT NULL "token" column.
UPDATE "GuestSession"
   SET "tokenHash" = CASE WHEN "token" ~ '^[0-9a-f]{64}$' THEN "token"
                          ELSE encode(sha256(convert_to("token", 'UTF8')), 'hex') END
 WHERE "tokenHash" IS NULL;

UPDATE "GuestSession" SET "token" = "tokenHash" WHERE "token" IS DISTINCT FROM "tokenHash";

-- Analytics rows written by a pre-hash build after file 1 ran (none expected once the deploy is confirmed).
UPDATE "AnalyticsEvent"
   SET "guestId" = encode(sha256(convert_to("guestId", 'UTF8')), 'hex')
 WHERE "guestId" IS NOT NULL AND "guestId" !~ '^[0-9a-f]{64}$';

-- Checks after applying (all expected 0):
--   SELECT count(*) FROM "GuestSession" WHERE "tokenHash" IS NULL;
--   SELECT count(*) FROM "GuestSession" WHERE "token" !~ '^[0-9a-f]{64}$';
--   SELECT count(*) FROM "AnalyticsEvent" WHERE "guestId" IS NOT NULL AND "guestId" !~ '^[0-9a-f]{64}$';
