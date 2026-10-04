-- AB-04 (2026-10-04): ScanSaveOptIn — one row per account for saving movement NUMBERS.
-- ADDITIVE ONLY. Generated offline:
--   prisma migrate diff --from-schema-datamodel <lane/finish-release schema> --to-schema-datamodel prisma/schema.prisma --script
--
-- ORDER: apply BEFORE any deploy that contains this lane. A deploy that runs first fails closed
-- (the opt-in read is try/catch → false) rather than 500, because no existing table grew a column.
-- Applying is the owner's step. This lane does not run it against production.
--
-- One scope, jump_numbers, covers jump numbers, Prove It, and re-screen history.
-- coachShares is JSON so SessionBooking is unchanged.

-- CreateTable
CREATE TABLE "ScanSaveOptIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'jump_numbers',
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "consentTextVersion" TEXT NOT NULL,
    "coachShares" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScanSaveOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanSaveOptIn_userId_key" ON "ScanSaveOptIn"("userId");

-- CreateIndex
CREATE INDEX "ScanSaveOptIn_userId_scope_idx" ON "ScanSaveOptIn"("userId", "scope");

-- AddForeignKey
ALTER TABLE "ScanSaveOptIn" ADD CONSTRAINT "ScanSaveOptIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
