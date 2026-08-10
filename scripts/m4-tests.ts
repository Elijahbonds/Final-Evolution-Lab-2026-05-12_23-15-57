/**
 * scripts/m4-tests.ts — M4 Track B (Real-money Competition) test suite.
 *
 * DB-backed tests run inside rolled-back transactions (no real data touched);
 * pure-logic tests run directly. Run: yarn tsx scripts/m4-tests.ts
 *
 * Coverage:
 *   T1.  checkCompetitionEligibility — accepts eligible user
 *   T2.  checkCompetitionEligibility — rejects underage / geo-blocked / self-excluded / kyc-rejected
 *   T3.  validateEntryFee — accepts valid, rejects out-of-range
 *   T4.  Escrow lock + settle lifecycle (rollback tx)
 *   T5.  Escrow lock + void/refund lifecycle (rollback tx)
 *   T6.  Escrow lock rejects insufficient funds (rollback tx)
 *   T7.  Wallet deposit + withdraw lifecycle (rollback tx)
 *   T8.  Wallet withdraw rejects overdraw (rollback tx)
 *   T9.  Mirror Triumph — first play sets bestScore, second beat increments streak (rollback tx)
 *   T10. Mirror Triumph — failure resets currentStreak (rollback tx)
 *   T11. Match seed generation is cryptographic hex, 32 chars
 *   T12. Score-duel expiry calculation
 *   T13. Rake + payout math (pure)
 */

import 'dotenv/config';
import assert from 'assert';
import { PrismaClient } from '@prisma/client';
import { getBalance, postTransaction, type DbClient, LedgerError } from '../lib/ledger';
import {
  ledgerEscrowLock,
  ledgerEscrowSettle,
  ledgerEscrowRefund,
  ledgerWalletDeposit,
  ledgerWalletWithdraw,
} from '../lib/stripe-helpers';
import {
  checkCompetitionEligibility,
  validateEntryFee,
  generateMatchSeed,
  scoreDuelExpiry,
  isExpired,
  totalPot,
  rakeAmount,
  winnerPayout,
  DEFAULT_RAKE_PERCENT,
  MIN_ENTRY_FEE_CENTS,
  MAX_ENTRY_FEE_CENTS,
  SCORE_DUEL_EXPIRY_HOURS,
} from '../lib/competition';

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

async function runPure(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    process.stdout.write('PASS\n');
    passed++;
  } catch (err: any) {
    process.stdout.write(`FAIL: ${err.message}\n`);
    failed++;
  }
}

async function mkUser(tx: DbClient, email: string, overrides: Record<string, any> = {}) {
  return (tx as any).user.create({
    data: {
      email,
      password: 'test',
      name: 'Test',
      dobYear: 2000,        // 26 years old — eligible
      kycStatus: 'NONE',
      declaredState: 'CA',
      ...overrides,
    },
  });
}

/** Seed USD wallet with a deposit so escrow can draw from it. */
async function seedUsdWallet(tx: DbClient, userId: string, amountCents: number) {
  await ledgerWalletDeposit(tx, {
    userId,
    amountCents,
    idempotencyKey: `seed-wallet:${userId}:${Date.now()}:${Math.random()}`,
  });
}

async function main() {
  console.log('\n=== M4 Track B (Real-money Competition) Tests ===\n');

  // ── T1: eligibility accepts eligible user ─────────────────────────────
  await runPure('T1 checkCompetitionEligibility accepts eligible user', () => {
    const r = checkCompetitionEligibility({
      dobYear: 2000,
      kycStatus: 'NONE',
      selfExcludedAt: null,
      declaredState: 'CA',
    });
    assert.strictEqual(r.allowed, true, `expected allowed, got: ${r.reason}`);
  });

  // ── T2: eligibility rejects various non-eligible states ──────────────
  await runPure('T2 checkCompetitionEligibility rejects underage/geo/excluded/kyc', () => {
    // Underage
    let r = checkCompetitionEligibility({ dobYear: 2020, kycStatus: 'NONE', selfExcludedAt: null, declaredState: 'CA' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'UNDERAGE');

    // No DOB
    r = checkCompetitionEligibility({ dobYear: null, kycStatus: 'NONE', selfExcludedAt: null, declaredState: 'CA' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'AGE_UNVERIFIED');

    // Geo blocked
    r = checkCompetitionEligibility({ dobYear: 2000, kycStatus: 'NONE', selfExcludedAt: null, declaredState: 'AK' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'GEO_BLOCKED');

    // No state
    r = checkCompetitionEligibility({ dobYear: 2000, kycStatus: 'NONE', selfExcludedAt: null, declaredState: null });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'GEO_UNKNOWN');

    // Self-excluded
    r = checkCompetitionEligibility({ dobYear: 2000, kycStatus: 'NONE', selfExcludedAt: new Date(), declaredState: 'CA' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'SELF_EXCLUDED');

    // KYC rejected
    r = checkCompetitionEligibility({ dobYear: 2000, kycStatus: 'REJECTED', selfExcludedAt: null, declaredState: 'CA' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'KYC_REJECTED');

    // KYC pending
    r = checkCompetitionEligibility({ dobYear: 2000, kycStatus: 'PENDING', selfExcludedAt: null, declaredState: 'CA' });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'KYC_PENDING');
  });

  // ── T3: validateEntryFee ──────────────────────────────────────────────
  await runPure('T3 validateEntryFee accepts valid, rejects out-of-range', () => {
    assert.strictEqual(validateEntryFee(500).allowed, true);
    assert.strictEqual(validateEntryFee(MIN_ENTRY_FEE_CENTS).allowed, true);
    assert.strictEqual(validateEntryFee(MAX_ENTRY_FEE_CENTS).allowed, true);
    assert.strictEqual(validateEntryFee(50).allowed, false); // below min
    assert.strictEqual(validateEntryFee(20000).allowed, false); // above max
    assert.strictEqual(validateEntryFee(0).allowed, false);
    assert.strictEqual(validateEntryFee(-100).allowed, false);
    assert.strictEqual(validateEntryFee(1.5 as any).allowed, false); // non-integer
  });

  // ── T4: Escrow lock + settle lifecycle ─────────────────────────────────
  await runInRollback('T4 escrow lock + settle lifecycle', async (tx) => {
    const u1 = await mkUser(tx, 'm4t4-p1@test.com');
    const u2 = await mkUser(tx, 'm4t4-p2@test.com');
    await seedUsdWallet(tx, u1.id, 1000); // $10.00
    await seedUsdWallet(tx, u2.id, 1000);

    const matchId = 'test-match-t4';
    const fee = 500; // $5.00

    // Player 1 locks
    await ledgerEscrowLock(tx, {
      userId: u1.id, amountCents: fee, matchId, idempotencyKey: `t4-lock:p1`,
    });
    // Player 2 locks
    await ledgerEscrowLock(tx, {
      userId: u2.id, amountCents: fee, matchId, idempotencyKey: `t4-lock:p2`,
    });

    // Escrow should hold 1000 cents
    const escrowBal = await getBalance(tx, { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId });
    assert.strictEqual(escrowBal, 1000, `escrow should be 1000, got ${escrowBal}`);

    // Each user wallet should be 500 (1000 - 500)
    const u1Bal = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u1.id });
    assert.strictEqual(u1Bal, 500, `u1 wallet should be 500, got ${u1Bal}`);

    // Settle — u1 wins
    const rake = rakeAmount(fee, DEFAULT_RAKE_PERCENT);
    const payout = winnerPayout(fee, DEFAULT_RAKE_PERCENT);
    await ledgerEscrowSettle(tx, {
      winnerId: u1.id, matchId, winnerPayoutCents: payout, rakeCents: rake,
      idempotencyKey: `t4-settle`,
    });

    // Escrow should be 0
    const escrowAfter = await getBalance(tx, { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId });
    assert.strictEqual(escrowAfter, 0, `escrow after settle should be 0, got ${escrowAfter}`);

    // Winner wallet: 500 (remaining) + 900 (payout) = 1400
    const u1After = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u1.id });
    assert.strictEqual(u1After, 500 + payout, `u1 after settle: expected ${500 + payout}, got ${u1After}`);

    // Platform revenue should have received the rake (positive = internal transfer from escrow)
    const rev = await getBalance(tx, { type: 'PLATFORM_REVENUE', currency: 'USD_CENTS' });
    assert.ok(rev >= rake, `platform revenue should be >= ${rake}, got ${rev}`);
  });

  // ── T5: Escrow lock + void/refund lifecycle ────────────────────────────
  await runInRollback('T5 escrow lock + void/refund lifecycle', async (tx) => {
    const u1 = await mkUser(tx, 'm4t5-p1@test.com');
    const u2 = await mkUser(tx, 'm4t5-p2@test.com');
    await seedUsdWallet(tx, u1.id, 2000);
    await seedUsdWallet(tx, u2.id, 2000);

    const matchId = 'test-match-t5';
    const fee = 500;

    await ledgerEscrowLock(tx, { userId: u1.id, amountCents: fee, matchId, idempotencyKey: `t5-lock:p1` });
    await ledgerEscrowLock(tx, { userId: u2.id, amountCents: fee, matchId, idempotencyKey: `t5-lock:p2` });

    // Refund both
    await ledgerEscrowRefund(tx, { userId: u1.id, amountCents: fee, matchId, idempotencyKey: `t5-refund:p1` });
    await ledgerEscrowRefund(tx, { userId: u2.id, amountCents: fee, matchId, idempotencyKey: `t5-refund:p2` });

    // Both wallets restored
    const u1Bal = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u1.id });
    assert.strictEqual(u1Bal, 2000, `u1 wallet should be 2000 after refund, got ${u1Bal}`);
    const u2Bal = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u2.id });
    assert.strictEqual(u2Bal, 2000, `u2 wallet should be 2000 after refund, got ${u2Bal}`);

    // Escrow drained
    const escrow = await getBalance(tx, { type: 'ESCROW', currency: 'USD_CENTS', scopeId: matchId });
    assert.strictEqual(escrow, 0, `escrow should be 0 after refund, got ${escrow}`);
  });

  // ── T6: Escrow lock rejects insufficient funds ────────────────────────
  await runInRollback('T6 escrow lock rejects insufficient funds', async (tx) => {
    const u1 = await mkUser(tx, 'm4t6@test.com');
    await seedUsdWallet(tx, u1.id, 200); // only $2.00

    try {
      await ledgerEscrowLock(tx, {
        userId: u1.id, amountCents: 500, matchId: 'test-match-t6',
        idempotencyKey: `t6-lock`,
      });
      assert.fail('Should have thrown NEGATIVE_BALANCE');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NEGATIVE_BALANCE', `expected NEGATIVE_BALANCE, got ${err.code}`);
    }
  });

  // ── T7: Wallet deposit + withdraw lifecycle ────────────────────────────
  await runInRollback('T7 wallet deposit + withdraw lifecycle', async (tx) => {
    const u1 = await mkUser(tx, 'm4t7@test.com');
    await ledgerWalletDeposit(tx, { userId: u1.id, amountCents: 5000, idempotencyKey: `t7-dep` });

    const bal1 = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u1.id });
    assert.strictEqual(bal1, 5000, `after deposit: expected 5000, got ${bal1}`);

    await ledgerWalletWithdraw(tx, { userId: u1.id, amountCents: 2000, idempotencyKey: `t7-wd` });
    const bal2 = await getBalance(tx, { type: 'USER_WALLET', currency: 'USD_CENTS', userId: u1.id });
    assert.strictEqual(bal2, 3000, `after withdraw: expected 3000, got ${bal2}`);
  });

  // ── T8: Wallet withdraw rejects overdraw ───────────────────────────────
  await runInRollback('T8 wallet withdraw rejects overdraw', async (tx) => {
    const u1 = await mkUser(tx, 'm4t8@test.com');
    await ledgerWalletDeposit(tx, { userId: u1.id, amountCents: 1000, idempotencyKey: `t8-dep` });

    try {
      await ledgerWalletWithdraw(tx, { userId: u1.id, amountCents: 2000, idempotencyKey: `t8-wd` });
      assert.fail('Should have thrown NEGATIVE_BALANCE');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NEGATIVE_BALANCE', `expected NEGATIVE_BALANCE, got ${err.code}`);
    }
  });

  // ── T9: Mirror Triumph — first play + beat ─────────────────────────────
  await runInRollback('T9 Mirror Triumph first play + beat increments streak', async (tx) => {
    const u1 = await mkUser(tx, 'm4t9@test.com');

    // First play — creates record
    const r1 = await (tx as any).mirrorTriumph.create({
      data: { userId: u1.id, mode: 'dunkContest', bestScore: 100, currentStreak: 0, longestStreak: 0, totalBeats: 0 },
    });
    assert.strictEqual(r1.bestScore, 100);
    assert.strictEqual(r1.currentStreak, 0);

    // Beat the ghost (score > bestScore)
    const newScore = 150;
    const newStreak = r1.currentStreak + 1;
    const updated = await (tx as any).mirrorTriumph.update({
      where: { userId_mode: { userId: u1.id, mode: 'dunkContest' } },
      data: {
        bestScore: newScore,
        currentStreak: newStreak,
        longestStreak: Math.max(r1.longestStreak, newStreak),
        totalBeats: r1.totalBeats + 1,
        lastBeatAt: new Date(),
      },
    });
    assert.strictEqual(updated.bestScore, 150);
    assert.strictEqual(updated.currentStreak, 1);
    assert.strictEqual(updated.totalBeats, 1);
    assert.strictEqual(updated.longestStreak, 1);
  });

  // ── T10: Mirror Triumph — failure resets streak ────────────────────────
  await runInRollback('T10 Mirror Triumph failure resets currentStreak', async (tx) => {
    const u1 = await mkUser(tx, 'm4t10@test.com');

    await (tx as any).mirrorTriumph.create({
      data: { userId: u1.id, mode: 'tennis', bestScore: 200, currentStreak: 5, longestStreak: 5, totalBeats: 5 },
    });

    // Score does not beat ghost
    const updated = await (tx as any).mirrorTriumph.update({
      where: { userId_mode: { userId: u1.id, mode: 'tennis' } },
      data: { currentStreak: 0 },
    });
    assert.strictEqual(updated.currentStreak, 0);
    assert.strictEqual(updated.longestStreak, 5); // longestStreak preserved
    assert.strictEqual(updated.bestScore, 200); // bestScore preserved
  });

  // ── T11: Match seed generation ─────────────────────────────────────────
  await runPure('T11 generateMatchSeed is 32-char hex', () => {
    const seed = generateMatchSeed();
    assert.strictEqual(seed.length, 32, `seed length should be 32, got ${seed.length}`);
    assert.ok(/^[0-9a-f]{32}$/.test(seed), `seed should be hex, got ${seed}`);
    // Two seeds should be different
    const seed2 = generateMatchSeed();
    assert.notStrictEqual(seed, seed2, 'two seeds should differ');
  });

  // ── T12: Score-duel expiry ─────────────────────────────────────────────
  await runPure('T12 scoreDuelExpiry and isExpired', () => {
    const exp = scoreDuelExpiry();
    assert.ok(exp instanceof Date);
    const diff = exp.getTime() - Date.now();
    // Should be roughly SCORE_DUEL_EXPIRY_HOURS in the future (within 5s tolerance)
    const expectedMs = SCORE_DUEL_EXPIRY_HOURS * 60 * 60 * 1000;
    assert.ok(Math.abs(diff - expectedMs) < 5000, `expiry drift too large: ${diff - expectedMs}ms`);

    // Not expired yet
    assert.strictEqual(isExpired(exp), false);
    // Past date is expired
    assert.strictEqual(isExpired(new Date('2020-01-01')), true);
    // Null is not expired
    assert.strictEqual(isExpired(null), false);
  });

  // ── T13: Rake + payout math ────────────────────────────────────────────
  await runPure('T13 rake + payout math', () => {
    const fee = 500; // $5.00
    const rake = DEFAULT_RAKE_PERCENT; // 10%

    assert.strictEqual(totalPot(fee), 1000); // $10.00
    assert.strictEqual(rakeAmount(fee, rake), 100); // $1.00
    assert.strictEqual(winnerPayout(fee, rake), 900); // $9.00

    // Edge: $1.00 entry
    assert.strictEqual(totalPot(100), 200);
    assert.strictEqual(rakeAmount(100, 10), 20);
    assert.strictEqual(winnerPayout(100, 10), 180);
  });

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
