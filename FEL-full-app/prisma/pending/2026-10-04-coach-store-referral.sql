-- COACH-STORE-V1 referral cut, paid from FEL's fee. Apply last.
-- ADDITIVE ONLY. No ledger enum change.

CREATE TABLE "CoachStoreReferral" (
    "id" TEXT NOT NULL,
    "paymentKey" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "shareOfFee" DOUBLE PRECISION NOT NULL,
    "cutCents" INTEGER NOT NULL,
    "renewalIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "holdUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachStoreReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachStoreReferral_paymentKey_key" ON "CoachStoreReferral"("paymentKey");

CREATE INDEX "CoachStoreReferral_referrerUserId_status_idx" ON "CoachStoreReferral"("referrerUserId", "status");

CREATE INDEX "CoachStoreReferral_buyerUserId_idx" ON "CoachStoreReferral"("buyerUserId");

CREATE INDEX "CoachStoreReferral_holdUntil_idx" ON "CoachStoreReferral"("holdUntil");
