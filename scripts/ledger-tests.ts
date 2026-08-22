/**
 * scripts/ledger-tests.ts — M1 parity/invariant tests for the double-entry ledger.
 *
 * No jest/vitest in this project, so this is a standalone assertion runner
 * executed via `yarn tsx scripts/ledger-tests.ts`. Exits non-zero on any
 * failure. Every test runs inside a transaction that is force-rolled-back, so
 * the suite NEVER mutates real data.
 *
 * Ported invariants (money-parity with the donor backend + cell_test intent):
 *   - sum(debits) == sum(credits)         (balanced postings)
 *   - append-only, idempotent movements    (replay is a no-op)
 *   - wallet balance never goes negative    (overdraft rejected)
 *   - derived balances match posting sums
 *   - escrow hold -> release lifecycle nets to zero
 *   - LC funnel keeps CreditLedger and the ledger in lockstep
 */

import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { postTransaction, postLc, getBalance, LedgerError, type DbClient } from '../lib/ledger';

const prisma = new PrismaClient();

class Rollback extends Error {}

/** Run fn inside a transaction that is always rolled back. */
async function inRollback(fn: (tx: DbClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx as unknown as DbClient);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(`${name}: ${e?.message ?? e}`);
    console.error(`  ✗ ${name} — ${e?.message ?? e}`);
  }
}

const U = () => `test-ledger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function run() {
  console.log('M1 ledger tests\n');

  await test('balanced transaction posts and derives balances', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      const res = await postTransaction(tx, {
        kind: 'TEST_EARN',
        idempotencyKey: `t:${userId}:1`,
        currency: 'LC',
        postings: [
          { account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 100 },
          { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -100 },
        ],
      });
      assert.equal(res.duplicate, false);
      const wallet = await getBalance(tx, { type: 'USER_WALLET', currency: 'LC', userId });
      const ext = await getBalance(tx, { type: 'EXTERNAL', currency: 'LC' });
      assert.equal(wallet, 100, 'wallet should be 100');
      assert.equal(wallet + ext, 0, 'wallet + external must net to zero');
    });
  });

  await test('unbalanced postings are rejected (sum!=0)', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      await assert.rejects(
        () =>
          postTransaction(tx, {
            kind: 'TEST_BAD',
            idempotencyKey: `t:${userId}:2`,
            currency: 'LC',
            postings: [
              { account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 100 },
              { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -90 },
            ],
          }),
        (e: any) => e instanceof LedgerError && e.code === 'UNBALANCED'
      );
    });
  });

  await test('single-posting transaction is rejected', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      await assert.rejects(
        () =>
          postTransaction(tx, {
            kind: 'TEST_BAD',
            idempotencyKey: `t:${userId}:3`,
            currency: 'LC',
            postings: [{ account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 0 } as any],
          }),
        (e: any) => e instanceof LedgerError
      );
    });
  });

  await test('currency mismatch is rejected', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      await assert.rejects(
        () =>
          postTransaction(tx, {
            kind: 'TEST_BAD',
            idempotencyKey: `t:${userId}:4`,
            currency: 'LC',
            postings: [
              { account: { type: 'USER_WALLET', currency: 'USD_CENTS', userId }, amount: 100 },
              { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -100 },
            ],
          }),
        (e: any) => e instanceof LedgerError && e.code === 'CURRENCY_MISMATCH'
      );
    });
  });

  await test('zero-amount posting is rejected', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      await assert.rejects(
        () =>
          postTransaction(tx, {
            kind: 'TEST_BAD',
            idempotencyKey: `t:${userId}:5`,
            currency: 'LC',
            postings: [
              { account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 0 },
              { account: { type: 'EXTERNAL', currency: 'LC' }, amount: 0 },
            ],
          }),
        (e: any) => e instanceof LedgerError && e.code === 'ZERO_POSTING'
      );
    });
  });

  await test('idempotency: replaying a key is a no-op', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      const key = `t:${userId}:idem`;
      const first = await postTransaction(tx, {
        kind: 'TEST_EARN',
        idempotencyKey: key,
        currency: 'LC',
        postings: [
          { account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 50 },
          { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -50 },
        ],
      });
      const second = await postTransaction(tx, {
        kind: 'TEST_EARN',
        idempotencyKey: key,
        currency: 'LC',
        postings: [
          { account: { type: 'USER_WALLET', currency: 'LC', userId }, amount: 50 },
          { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -50 },
        ],
      });
      assert.equal(first.duplicate, false);
      assert.equal(second.duplicate, true, 'second post must be duplicate');
      assert.equal(second.transactionId, first.transactionId, 'same transaction id');
      const wallet = await getBalance(tx, { type: 'USER_WALLET', currency: 'LC', userId });
      assert.equal(wallet, 50, 'balance reflects a single movement, not two');
    });
  });

  await test('overdraft on a USER_WALLET is rejected (non-negative guard)', async () => {
    await inRollback(async (tx) => {
      const userId = U();
      await assert.rejects(
        () =>
          postTransaction(tx, {
            kind: 'TEST_SPEND',
            idempotencyKey: `t:${userId}:od`,
            currency: 'USD_CENTS',
            postings: [
              { account: { type: 'USER_WALLET', currency: 'USD_CENTS', userId }, amount: -100 },
              { account: { type: 'EXTERNAL', currency: 'USD_CENTS' }, amount: 100 },
            ],
          }),
        (e: any) => e instanceof LedgerError && e.code === 'NEGATIVE_BALANCE'
      );
    });
  });

  await test('escrow hold -> release lifecycle nets to zero', async () => {
    await inRollback(async (tx) => {
      const buyer = U();
      const creator = U();
      const matchId = `m-${buyer}`;
      // Fund the buyer wallet with 1000 cents from EXTERNAL (e.g. a Stripe deposit).
      await postTransaction(tx, {
        kind: 'DEPOSIT',
        idempotencyKey: `t:${buyer}:dep`,
        currency: 'USD_CENTS',
        postings: [
          { account: { type: 'USER_WALLET', currency: 'USD_CENTS', userId: buyer }, amount: 1000 },
          { account: { type: 'EXTERNAL', currency: 'USD_CENTS' }, amount: -1000 },
        ],
      });
      // Move 1000 into escrow for a match.
      await postTransaction(tx, {
        kind: 'ESCROW_HOLD',
        idempotencyKey: `t:${buyer}:hold`,
        currency: 'USD_CENTS',
        postings: [
          { account: { type: 'USER_WALLET', currency: 'USD_CENTS', userId: buyer }, amount: -1000 },
          { account: { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId }, amount: 1000 },
        ],
      });
      const escrowBal = await getBalance(tx, { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId });
      assert.equal(escrowBal, 1000, 'escrow holds 1000');
      // Release: 700 to creator accrual, 300 to platform revenue.
      await postTransaction(tx, {
        kind: 'ESCROW_RELEASE',
        idempotencyKey: `t:${buyer}:rel`,
        currency: 'USD_CENTS',
        postings: [
          { account: { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId }, amount: -1000 },
          { account: { type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId: creator }, amount: 700 },
          { account: { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' }, amount: 300 },
        ],
      });
      const escrowAfter = await getBalance(tx, { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId });
      const creatorBal = await getBalance(tx, { type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId: creator });
      const platformBal = await getBalance(tx, { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' });
      assert.equal(escrowAfter, 0, 'escrow fully released');
      assert.equal(creatorBal, 700, 'creator accrues 700 (70%)');
      assert.equal(platformBal, 300, 'platform keeps 300 (30%)');
    });
  });

  await test('LC funnel keeps CreditLedger and ledger in lockstep', async () => {
    await inRollback(async (tx) => {
      const tag = U();
      // CreditLedger has a FK to User, so create a throwaway user (rolled back).
      const user = await (tx as any).user.create({
        data: { email: `${tag}@test.local`, password: 'x', name: 'ledger-test' },
        select: { id: true },
      });
      const userId = user.id as string;
      await postLc(tx, { userId, amount: 100, reason: 'TEST_EARN', dedupeKey: `test:${userId}:e` });
      await postLc(tx, { userId, amount: -30, reason: 'TEST_SPEND', dedupeKey: `test:${userId}:s` });
      const legacy = await (tx as any).creditLedger.aggregate({ where: { userId }, _sum: { amount: true } });
      const wallet = await getBalance(tx, { type: 'USER_WALLET', currency: 'LC', userId });
      assert.equal(legacy._sum.amount, 70, 'CreditLedger sum == 70');
      assert.equal(wallet, 70, 'ledger wallet == 70');
      assert.equal(legacy._sum.amount, wallet, 'CreditLedger and ledger agree');
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

run()
  .catch((e) => {
    console.error('test runner error', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
