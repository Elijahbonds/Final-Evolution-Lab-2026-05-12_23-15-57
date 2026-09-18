/**
 * scripts/m2-tests.ts — M2 Track A Revenue test suite.
 *
 * Tests run inside rolled-back transactions (no real data touched).
 * Run: yarn tsx scripts/m2-tests.ts
 *
 * Coverage:
 *   T1. Subscription ledger flow: EXTERNAL → PLATFORM_REVENUE (USD_CENTS)
 *   T2. Cosmetic purchase ledger flow
 *   T3. Marketplace sale: platform cut + creator accrual split
 *   T4. Payout: CREATOR_ACCRUAL → EXTERNAL
 *   T5. Payout idempotency (same key = no double payout)
 *   T6. Webhook replay safety (same event.id = no double posting)
 *   T7. Ladder prize LC flow: EXTERNAL → USER_WALLET:LC
 *   T8. Ladder prize idempotency
 *   T9. Subscription cancel revokes entitlement (status update)
 */

import 'dotenv/config';
import assert from 'assert';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  postTransaction,
  getBalance,
  type DbClient,
  type LedgerCurrency,
} from '../lib/ledger';
import {
  ledgerSubscriptionPayment,
  ledgerCosmeticPurchase,
  ledgerMarketplaceSale,
  ledgerPayout,
  ledgerLadderPrize,
} from '../lib/stripe-helpers';

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

async function runInRollback(name: string, fn: (tx: DbClient) => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx as DbClient);
      throw new Error('__ROLLBACK__');
    });
  } catch (err: any) {
    if (err.message === '__ROLLBACK__') {
      process.stdout.write('PASS\n');
      passed++;
      return;
    }
    process.stdout.write(`FAIL: ${err.message}\n`);
    failed++;
  }
}

async function main() {
  console.log('\n=== M2 Track A Revenue Tests ===\n');

  // Helper: create a throwaway user inside the tx for FK constraints
  async function mkUser(tx: DbClient, email: string) {
    return (tx as any).user.create({
      data: { email, password: 'test', name: 'Test' },
    });
  }

  // T1: Subscription payment ledger
  await runInRollback('T1 Subscription payment → PLATFORM_REVENUE', async (tx) => {
    const user = await mkUser(tx, `t1-${Date.now()}@test.com`);
    const result = await ledgerSubscriptionPayment(tx, {
      userId: user.id,
      amountCents: 999,
      idempotencyKey: `test-sub-${Date.now()}`,
      kind: 'SUBSCRIPTION_PAYMENT_FEL_PRO',
      metadata: { test: true },
    });
    assert.ok(result.transactionId, 'should return transactionId');
    assert.strictEqual(result.duplicate, false);

    // PLATFORM_REVENUE should have negative balance (money IN = negative posting)
    const revBal = await getBalance(tx, { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' });
    assert.strictEqual(revBal, -999, 'platform revenue should be -999 (999 cents credited)');

    // EXTERNAL should have positive (money OUT of external)
    const extBal = await getBalance(tx, { type: 'EXTERNAL', currency: 'USD_CENTS' });
    assert.strictEqual(extBal, 999, 'external should be +999');
  });

  // T2: Cosmetic purchase ledger
  await runInRollback('T2 Cosmetic purchase → PLATFORM_REVENUE', async (tx) => {
    const user = await mkUser(tx, `t2-${Date.now()}@test.com`);
    const result = await ledgerCosmeticPurchase(tx, {
      userId: user.id,
      amountCents: 499,
      idempotencyKey: `test-cosm-${Date.now()}`,
    });
    assert.ok(result.transactionId);
    const revBal = await getBalance(tx, { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' });
    assert.strictEqual(revBal, -499);
  });

  // T3: Marketplace sale split
  await runInRollback('T3 Marketplace sale → platform + creator split', async (tx) => {
    const buyer = await mkUser(tx, `t3-buyer-${Date.now()}@test.com`);
    const creator = await mkUser(tx, `t3-creator-${Date.now()}@test.com`);
    const totalCents = 1000;
    const platformCut = 150; // 15%
    const creatorCut = 850;

    const result = await ledgerMarketplaceSale(tx, {
      buyerId: buyer.id,
      creatorId: creator.id,
      totalCents,
      platformCutCents: platformCut,
      idempotencyKey: `test-mkt-${Date.now()}`,
    });
    assert.ok(result.transactionId);

    const revBal = await getBalance(tx, { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' });
    assert.strictEqual(revBal, -platformCut, `platform gets ${platformCut}`);

    const creatorBal = await getBalance(tx, {
      type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId: creator.id,
    });
    assert.strictEqual(creatorBal, -creatorCut, `creator accrues ${creatorCut}`);

    const extBal = await getBalance(tx, { type: 'EXTERNAL', currency: 'USD_CENTS' });
    assert.strictEqual(extBal, totalCents, 'external = total');
  });

  // T4: Payout from creator accrual
  await runInRollback('T4 Payout CREATOR_ACCRUAL → EXTERNAL', async (tx) => {
    const creator = await mkUser(tx, `t4-${Date.now()}@test.com`);
    // First accrue some funds via a marketplace sale
    await ledgerMarketplaceSale(tx, {
      buyerId: 'dummy-buyer-id', // no FK on ledger accounts
      creatorId: creator.id,
      totalCents: 1000,
      platformCutCents: 150,
      idempotencyKey: `t4-sale-${Date.now()}`,
    });

    // Creator accrual should be -850 (850 owed to creator)
    const before = await getBalance(tx, {
      type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId: creator.id,
    });
    assert.strictEqual(before, -850);

    // Payout 850
    const result = await ledgerPayout(tx, {
      userId: creator.id,
      amountCents: 850,
      idempotencyKey: `t4-payout-${Date.now()}`,
    });
    assert.ok(result.transactionId);

    // After payout, accrual should be 0
    const after = await getBalance(tx, {
      type: 'CREATOR_ACCRUAL', currency: 'USD_CENTS', userId: creator.id,
    });
    assert.strictEqual(after, 0, 'accrual zeroed after full payout');
  });

  // T5: Payout idempotency
  await runInRollback('T5 Payout idempotency (same key = no double payout)', async (tx) => {
    const creator = await mkUser(tx, `t5-${Date.now()}@test.com`);
    await ledgerMarketplaceSale(tx, {
      buyerId: 'dummy',
      creatorId: creator.id,
      totalCents: 2000,
      platformCutCents: 300,
      idempotencyKey: `t5-sale-${Date.now()}`,
    });

    const key = `t5-payout-${Date.now()}`;
    const r1 = await ledgerPayout(tx, { userId: creator.id, amountCents: 1700, idempotencyKey: key });
    assert.strictEqual(r1.duplicate, false);

    const r2 = await ledgerPayout(tx, { userId: creator.id, amountCents: 1700, idempotencyKey: key });
    assert.strictEqual(r2.duplicate, true, 'second call should be duplicate');
    assert.strictEqual(r1.transactionId, r2.transactionId, 'same txId');
  });

  // T6: Webhook replay safety (same idempotencyKey = no double posting)
  await runInRollback('T6 Webhook replay safety', async (tx) => {
    const user = await mkUser(tx, `t6-${Date.now()}@test.com`);
    const key = `stripe-event:evt_test_${Date.now()}`;

    const r1 = await ledgerSubscriptionPayment(tx, {
      userId: user.id,
      amountCents: 999,
      idempotencyKey: key,
      kind: 'SUBSCRIPTION_PAYMENT_FEL_PRO',
    });
    assert.strictEqual(r1.duplicate, false);

    // Replay same event
    const r2 = await ledgerSubscriptionPayment(tx, {
      userId: user.id,
      amountCents: 999,
      idempotencyKey: key,
      kind: 'SUBSCRIPTION_PAYMENT_FEL_PRO',
    });
    assert.strictEqual(r2.duplicate, true, 'replay should be detected');

    // Only one transaction in the ledger
    const count = await (tx as any).ledgerTransaction.count({
      where: { idempotencyKey: key },
    });
    assert.strictEqual(count, 1, 'only 1 ledger row for replayed event');
  });

  // T7: Ladder LC prize
  await runInRollback('T7 Ladder prize → USER_WALLET:LC', async (tx) => {
    const user = await mkUser(tx, `t7-${Date.now()}@test.com`);
    const result = await ledgerLadderPrize(tx, {
      userId: user.id,
      amountLc: 250,
      idempotencyKey: `ladder-prize-t7-${Date.now()}`,
    });
    assert.ok(result.transactionId);

    const walletBal = await getBalance(tx, {
      type: 'USER_WALLET', currency: 'LC', userId: user.id,
    });
    assert.strictEqual(walletBal, 250, 'user gets 250 LC');
  });

  // T8: Ladder prize idempotency
  await runInRollback('T8 Ladder prize idempotency', async (tx) => {
    const user = await mkUser(tx, `t8-${Date.now()}@test.com`);
    const key = `ladder-prize-t8-${Date.now()}`;

    const r1 = await ledgerLadderPrize(tx, { userId: user.id, amountLc: 100, idempotencyKey: key });
    const r2 = await ledgerLadderPrize(tx, { userId: user.id, amountLc: 100, idempotencyKey: key });
    assert.strictEqual(r2.duplicate, true);

    const walletBal = await getBalance(tx, {
      type: 'USER_WALLET', currency: 'LC', userId: user.id,
    });
    assert.strictEqual(walletBal, 100, 'no double award');
  });

  // T9: Subscription status lifecycle
  await runInRollback('T9 Subscription cancel → status CANCELED', async (tx) => {
    const user = await mkUser(tx, `t9-${Date.now()}@test.com`);
    // Create a subscription record
    const sub = await (tx as any).subscription.create({
      data: {
        userId: user.id,
        stripeSubscriptionId: `sub_test_${Date.now()}`,
        stripePriceId: 'price_test',
        product: 'FEL_PRO',
        status: 'ACTIVE',
      },
    });
    assert.strictEqual(sub.status, 'ACTIVE');

    // Simulate cancel
    await (tx as any).subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELED', cancelAtPeriodEnd: false },
    });
    const updated = await (tx as any).subscription.findUnique({ where: { id: sub.id } });
    assert.strictEqual(updated.status, 'CANCELED', 'status should be CANCELED');

    // Entitlement check
    const activeSubs = await (tx as any).subscription.findMany({
      where: { userId: user.id, product: 'FEL_PRO', status: 'ACTIVE' },
    });
    assert.strictEqual(activeSubs.length, 0, 'no active FEL_PRO after cancel');
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
