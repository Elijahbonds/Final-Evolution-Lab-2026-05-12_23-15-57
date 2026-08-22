/**
 * scripts/ledger-invariants.ts — M1 daily invariant job.
 *
 * Verifies the ledger's integrity invariants and exits non-zero on any
 * violation (so it can be wired to a scheduled task / CI gate).
 *
 *   I1. GLOBAL DOUBLE-ENTRY: SUM(all postings.amount) == 0.
 *   I2. PER-TRANSACTION: every transaction's postings sum to 0.
 *   I3. NON-NEGATIVE: every non-EXTERNAL account balance >= 0.
 *   I4. ESCROW COVERAGE: total ESCROW held == sum of open-match escrow
 *       (no Match model yet -> expected 0; ready for M4).
 *   I5. LC MIGRATION EQUIVALENCE: for every user,
 *       USER_WALLET:LC balance == SUM(CreditLedger.amount).
 *
 * Run:  yarn tsx scripts/ledger-invariants.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Violation {
  code: string;
  detail: string;
}

async function main() {
  const violations: Violation[] = [];

  // I1 — global double-entry integrity.
  const globalAgg = await prisma.ledgerPosting.aggregate({ _sum: { amount: true } });
  const globalSum = globalAgg._sum.amount ?? 0;
  if (globalSum !== 0) {
    violations.push({ code: 'I1_GLOBAL_NONZERO', detail: `SUM(postings)=${globalSum} (expected 0)` });
  }

  // I2 — per-transaction balance.
  const perTx = await prisma.ledgerPosting.groupBy({
    by: ['transactionId'],
    _sum: { amount: true },
  });
  for (const t of perTx) {
    const s = t._sum.amount ?? 0;
    if (s !== 0) {
      violations.push({ code: 'I2_TX_UNBALANCED', detail: `tx ${t.transactionId} sums to ${s}` });
    }
  }

  // I3 — non-negative balances for non-EXTERNAL accounts.
  const perAccount = await prisma.ledgerPosting.groupBy({
    by: ['accountId'],
    _sum: { amount: true },
  });
  const balById = new Map<string, number>();
  for (const a of perAccount) balById.set(a.accountId, a._sum.amount ?? 0);
  const accounts = await prisma.ledgerAccount.findMany();
  let escrowTotal = 0;
  for (const acct of accounts) {
    const bal = balById.get(acct.id) ?? 0;
    if (acct.type !== 'EXTERNAL' && bal < 0) {
      violations.push({ code: 'I3_NEGATIVE', detail: `${acct.key} balance ${bal}` });
    }
    if (acct.type === 'ESCROW') escrowTotal += bal;
  }

  // I4 — escrow coverage. No Match model in this milestone -> open escrow == 0.
  const openEscrowExpected = 0;
  if (escrowTotal !== openEscrowExpected) {
    violations.push({
      code: 'I4_ESCROW_MISMATCH',
      detail: `escrow held ${escrowTotal} != open-match total ${openEscrowExpected}`,
    });
  }

  // I5 — LC migration equivalence per user.
  const lcByUserLedger = await prisma.creditLedger.groupBy({
    by: ['userId'],
    _sum: { amount: true },
  });
  const lcWalletAccounts = accounts.filter((a) => a.type === 'USER_WALLET' && a.currency === 'LC');
  const walletBalByUser = new Map<string, number>();
  for (const acct of lcWalletAccounts) {
    if (acct.userId) walletBalByUser.set(acct.userId, balById.get(acct.id) ?? 0);
  }
  for (const row of lcByUserLedger) {
    const expected = row._sum.amount ?? 0;
    const actual = walletBalByUser.get(row.userId) ?? 0;
    if (expected !== actual) {
      violations.push({
        code: 'I5_LC_DRIFT',
        detail: `user ${row.userId}: wallet ${actual} != CreditLedger sum ${expected}`,
      });
    }
  }

  if (violations.length) {
    console.error(`[invariants] FAIL — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v.code}: ${v.detail}`);
    process.exit(1);
  }
  console.log(
    `[invariants] OK — globalSum=0, ${perTx.length} txns balanced, ${accounts.length} accounts non-negative, escrow=${escrowTotal}, LC equivalence across ${lcByUserLedger.length} user(s).`
  );
}

main()
  .catch((e) => {
    console.error('[invariants] ERROR', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
