-- RATE-LIMIT-WIRE (PR #289, QA rework 2026-10-16; the table approved by Elijah): rate_limits.
-- Login, signup, run start, season claim and Arena submit count their requests here, so every server instance sees the
-- same number (firebase.json runs up to 4). Before this, the only counts were each instance's own memory.
-- ADDITIVE ONLY: one new table, its primary key and one index. Nothing existing is changed or dropped.
--
-- What a row is: one counting window of one bucket. "bucket" is "<route>:<kind>:<digest>" (lib/rate-limits/store.ts),
-- where the digest is an HMAC of the email, account id or proxy-set address, so no email, IP or account id is stored in
-- the clear. "hits" counts the requests since the window opened; "reset_at" (UTC) is when it closes. One row per bucket:
-- the next request after "reset_at" starts the window again in the same row.
--
-- Written by hand from `prisma migrate diff --from-empty` of the model below (the statements are its output, verbatim).
-- This lane ran no Prisma command against any database (no migrate, no db push). The model IS in prisma/schema.prisma
-- (5eb5f594) and public/_prisma is regenerated for it (89ff92c4, engine binaries unchanged), both kept by Elijah on
-- 2026-10-16, so steps 1 and 5 below are already done; the model generates exactly the two statements below. The table
-- itself is still the owner's to apply (steps 2 to 4). The deploy's build only generates the client; it never touches
-- the database, so the model shipping before this file is applied creates nothing.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/rate-limits/store.ts writes with raw, parameterised SQL. Without the table
-- it falls back to the per-instance window it had before (lib/rate-limit.ts), so no route is ever unlimited and none
-- answers 500; within ~5 minutes of this file being applied the counts move to the table. No deploy, no env change.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4), in this order:
--   1. DONE (5eb5f594): the model in prisma/schema.prisma (without it, every later `migrate diff` proposes DROP TABLE):
--        model RateLimit {
--          bucket  String   @id
--          hits    Int
--          resetAt DateTime @map("reset_at") @db.Timestamp(3)
--
--          @@index([resetAt], map: "rate_limits_reset_at_idx")
--          @@map("rate_limits")
--        }
--   2. Preview, read-only: npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      It should print exactly the statements below (plus anything another unapplied lane adds — stop and review if so).
--   3. Apply: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-16-rate-limits.sql
--   4. Verify: the same migrate diff prints an empty migration.
--   5. DONE (89ff92c4): the client (copy-prisma-schema, prisma:generate; the schema-sync and prisma-artifact tests pass).
--      The code does not need the generated model; it uses raw SQL.
--
-- CLEAN-UP: a row is dead once its window has closed. lib/rate-limits/store.ts deletes rows whose "reset_at" is more than
-- an hour past, at most once every 10 minutes per server, on the "reset_at" index below:
--     DELETE FROM "rate_limits" WHERE "reset_at" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 hour';
-- ROLLBACK (the routes fall back to per-instance counts): DROP TABLE "rate_limits";

-- CreateTable
CREATE TABLE "rate_limits" (
    "bucket" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "reset_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket")
);

-- CreateIndex
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");
