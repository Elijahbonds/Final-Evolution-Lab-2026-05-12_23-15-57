/**
 * scripts/ledger-backfill.ts — M1 migration.
 *
 * Projects the ENTIRE existing CreditLedger history onto the double-entry
 * ledger so that, for every user:
 *     USER_WALLET:LC balance  ==  SUM(CreditLedger.amount)
 *
 * Idempotent: each CreditLedger row maps to a LedgerTransaction with
 * idempotencyKey `lc:<creditLedgerId>`, so re-running is a safe no-op.
 * Historical replay uses enforceNonNegative:false (we faithfully mirror what
 * already happened; the invariant job flags any anomaly separately).
 *
 * Run:  yarn tsx scripts/ledger-backfill.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { postTransaction } from '../lib/ledger';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.creditLedger.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, amount: true, reason: true, createdAt: true },
  });

  let mirrored = 0;
  let skippedZero = 0;
  let duplicates = 0;

  for (const row of rows) {
    if (!row.amount) {
      skippedZero++;
      continue;
    }
    const res = await postTransaction(prisma, {
      kind: row.reason || 'LEGACY_LC',
      idempotencyKey: `lc:${row.id}`,
      currency: 'LC',
      enforceNonNegative: false,
      metadata: { backfill: true, creditLedgerId: row.id, at: row.createdAt.toISOString() },
      postings: [
        { account: { type: 'USER_WALLET', currency: 'LC', userId: row.userId }, amount: row.amount },
        { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -row.amount },
      ],
    });
    if (res.duplicate) duplicates++;
    else mirrored++;
  }

  console.log(
    `[backfill] rows=${rows.length} mirrored=${mirrored} duplicates(existing)=${duplicates} skippedZero=${skippedZero}`
  );
}

main()
  .catch((e) => {
    console.error('[backfill] FAILED', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
