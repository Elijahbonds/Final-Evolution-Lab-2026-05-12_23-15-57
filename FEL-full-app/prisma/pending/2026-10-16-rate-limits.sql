-- RATE-LIMIT-WIRE (PR #289, QA rework 2026-10-16, the table approved by Elijah; rebuilt on lane/finish-release as
-- lane/rate-limits, 2026-10-23): rate_limits.
-- Login, signup, run start, season claim and Arena submit count their requests here, so every server instance sees the
-- same number (firebase.json runs up to 4). Before this, the only counts were each instance's own memory.
-- ADDITIVE ONLY: one new table, its primary key and one index. Nothing existing is changed or dropped.
--
-- What a row is: one counting window of one bucket. "bucket" is "<route>:<kind>:<digest>" (lib/rate-limits/store.ts),
-- where the digest is an HMAC of the email, account id or proxy-set address, so no email, IP or account id is stored in
-- the clear. "hits" counts the requests since the window opened; "reset_at" (UTC) is when it closes. One row per bucket:
-- the next request after "reset_at" starts the window again in the same row.
--
-- The statements below are, verbatim, what `prisma migrate diff --from-schema-datamodel <release schema>
-- --to-schema-datamodel prisma/schema.prisma --script` prints for the RateLimit model (schema-only, no database). The
-- model is in prisma/schema.prisma and public/_prisma is regenerated for it in the same lane, so db-guard
-- (docs/DB-GUARD.md) sees exactly this file in production's diff and can apply it. This lane ran no Prisma command
-- against any database (no migrate, no db push).
--
--        model RateLimit {
--          bucket  String   @id
--          hits    Int
--          resetAt DateTime @map("reset_at") @db.Timestamp(3)
--
--          @@index([resetAt], map: "rate_limits_reset_at_idx")
--          @@map("rate_limits")
--        }
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/rate-limits/store.ts writes with raw, parameterised SQL and never through the
-- generated model. Without the table (or with no database at all) every limit FAILS OPEN: one warn line
-- ("[rate-limits] table_missing_failing_open …"), and the request goes on as it did before this lane, so no route answers
-- 500 because of its limit. The missing table is asked about again after 5 minutes, so applying this file switches the
-- limits on with no deploy and no env change.
--
-- APPLYING IT: db-guard applies it when production's diff is exactly this file (docs/DB-GUARD.md §2). By hand
-- (OWNER-RUNBOOK.md §4), in this order:
--   1. Preview, read-only: npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      It should print exactly the statements below (plus anything another unapplied lane adds — stop and review if so).
--   2. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-16-rate-limits.sql
--   3. Verify: the same migrate diff prints an empty migration.
--
-- CLEAN-UP: a row is dead once its window has closed. lib/rate-limits/store.ts deletes rows whose "reset_at" is more than
-- an hour past, at most once every 10 minutes per server, on the "reset_at" index below:
--     DELETE FROM "rate_limits" WHERE "reset_at" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 hour';
-- ROLLBACK (the limits fail open again): DROP TABLE "rate_limits"; — only after a deploy whose client no longer has the
-- model (docs/DB-GUARD.md §7). In practice, don't: an unused additive table is harmless.

-- CreateTable
CREATE TABLE "rate_limits" (
    "bucket" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "reset_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket")
);

-- CreateIndex
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");
