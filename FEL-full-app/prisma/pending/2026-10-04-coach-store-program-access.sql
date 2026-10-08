-- COACH-STORE-V1 program and membership access. Apply after instructor.
-- ADDITIVE ONLY.

CREATE TABLE "ProgramAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "billing" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'lane',
    "beneficiary" TEXT NOT NULL DEFAULT 'self',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "stripeFeeCents" INTEGER NOT NULL DEFAULT 0,
    "reviewCredits" INTEGER NOT NULL DEFAULT 0,
    "lastCreditInvoiceId" TEXT,
    "stripeCheckoutId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "accessUntil" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "coachingProgramId" TEXT,
    "startedAt" TIMESTAMP(3),
    "nextRescreenAt" TIMESTAMP(3),
    "unlockCodeHash" TEXT,
    "deviceTokenHash" TEXT,
    "codeActive" BOOLEAN NOT NULL DEFAULT true,
    "redeemedAt" TIMESTAMP(3),
    "reissueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgramAccess_stripeCheckoutId_key" ON "ProgramAccess"("stripeCheckoutId");

CREATE UNIQUE INDEX "ProgramAccess_stripeSubscriptionId_key" ON "ProgramAccess"("stripeSubscriptionId");

CREATE UNIQUE INDEX "ProgramAccess_stripePaymentIntentId_key" ON "ProgramAccess"("stripePaymentIntentId");

CREATE UNIQUE INDEX "ProgramAccess_unlockCodeHash_key" ON "ProgramAccess"("unlockCodeHash");

CREATE INDEX "ProgramAccess_instructorId_status_idx" ON "ProgramAccess"("instructorId", "status");

CREATE INDEX "ProgramAccess_unlockCodeHash_idx" ON "ProgramAccess"("unlockCodeHash");

CREATE UNIQUE INDEX "ProgramAccess_userId_listingId_beneficiary_key" ON "ProgramAccess"("userId", "listingId", "beneficiary");

ALTER TABLE "ProgramAccess" ADD CONSTRAINT "ProgramAccess_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
