-- PAYMENTS-READY (2026-10-26; the owner's "turn on payments"): what the coach business needs from Stripe events before
-- payments go live — whether Stripe is asking a coach for something (account.updated), and the disputes on a coach's
-- sales (charge.dispute.created / .closed / .funds_withdrawn / .funds_reinstated).
-- ADDITIVE ONLY: one new column on CoachConnectAccount and one new table with two indexes and one foreign key. No
-- existing column is changed or dropped. NEEDS 2026-10-25-coach-business.sql FIRST (both tables it names come from it).
--
-- WHAT IS STORED.
--   CoachConnectAccount.requirementsDue — true while Stripe lists something the coach must still provide (requirements
--                         currently due or past due, or the account disabled). Set from account.updated; /coach/business
--                         shows "Finish your Stripe setup" while it is true. No requirement detail is kept: Stripe's own
--                         onboarding page asks the coach for it.
--   CoachSaleDispute    — one row per Stripe dispute on a coach's sale: the dispute id, the sale and coach, the charge,
--                         the disputed amount, Stripe's reason code and status, the outcome (OPEN, WON, LOST), and the
--                         money Stripe withdrew from and returned to FEL's balance (dispute amount + fee). The coach sees
--                         it on /coach/business (the in-app notice). Kept like CoachSale (a money record: no User foreign
--                         key, so an account erase never deletes it).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma,
-- public/_prisma/** and lib/generated/prisma/** are unchanged (the precedent: 2026-10-25-coach-business.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach-business/store.ts probes information_schema for CoachSaleDispute (the
-- last thing created): without it account.updated keeps the three status flags only, a coach-sale dispute is logged and
-- answered 200 without a row (FEL's ledger is still booked), and the dashboard shows no dispute list. Within ~5 minutes
-- of applying, the feature reads the new column and table.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4), AFTER 2026-10-25-coach-business.sql:
--   1. Locally, add to prisma/schema.prisma, in model CoachConnectAccount:
--
--          requirementsDue  Boolean  @default(false)
--
--      in model CoachSale:
--
--          disputes          CoachSaleDispute[]
--
--      and the new model:
--
--        model CoachSaleDispute {
--          /// Stripe's dispute id (dp_…).
--          id              String    @id
--          saleId          String
--          coachId         String
--          chargeId        String
--          amountCents     Int
--          reason          String    @default("")
--          stripeStatus    String
--          /// OPEN | WON | LOST
--          outcome         String    @default("OPEN")
--          withdrawnCents  Int       @default(0)
--          reinstatedCents Int       @default(0)
--          livemode        Boolean   @default(false)
--          createdAt       DateTime  @default(now())
--          updatedAt       DateTime  @updatedAt
--          closedAt        DateTime?
--          sale            CoachSale @relation(fields: [saleId], references: [id], onDelete: Restrict)
--
--          @@index([coachId, createdAt])
--          @@index([saleId])
--        }
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-payments-ready.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the clients (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ROLLBACK (loses every dispute record and the requirements flag; Stripe keeps its own record of both):
-- DROP TABLE "CoachSaleDispute"; ALTER TABLE "CoachConnectAccount" DROP COLUMN "requirementsDue";

-- AlterTable
ALTER TABLE "CoachConnectAccount" ADD COLUMN     "requirementsDue" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CoachSaleDispute" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "stripeStatus" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'OPEN',
    "withdrawnCents" INTEGER NOT NULL DEFAULT 0,
    "reinstatedCents" INTEGER NOT NULL DEFAULT 0,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CoachSaleDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachSaleDispute_coachId_createdAt_idx" ON "CoachSaleDispute"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachSaleDispute_saleId_idx" ON "CoachSaleDispute"("saleId");

-- AddForeignKey
ALTER TABLE "CoachSaleDispute" ADD CONSTRAINT "CoachSaleDispute_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "CoachSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
