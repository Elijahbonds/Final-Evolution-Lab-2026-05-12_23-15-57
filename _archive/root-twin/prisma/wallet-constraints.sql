-- FEL wallet non-negativity CHECK constraints.
-- Applied post-`prisma db push` (Prisma does not model CHECK constraints).
-- Idempotent: drops-then-adds so re-running is safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_coins_nonneg') THEN
    ALTER TABLE "Wallet" ADD CONSTRAINT wallet_coins_nonneg CHECK (coins >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_shards_nonneg') THEN
    ALTER TABLE "Wallet" ADD CONSTRAINT wallet_shards_nonneg CHECK (shards >= 0);
  END IF;
END $$;