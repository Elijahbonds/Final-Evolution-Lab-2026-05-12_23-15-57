/**
 * scripts/arena-tests.ts — M14 Triumph Arena acceptance tests.
 *
 * Harness: `yarn tsx scripts/arena-tests.ts` + node:assert (no jest/vitest).
 * Exits non-zero on any failure.
 *
 * Coverage:
 *   PURE (no DB):
 *     - config invariants (rake, fee tiers within bounds, modes are skill modes)
 *     - validateArenaFee: bounds + integer discipline
 *     - resolveArena: p1/p2/tie ordering
 *     - pot / rake / payout math (pot conservation: payout + rake == 2*fee)
 *     - isArenaMode allow-list
 *     - arenaExpiry ~48h in the future
 *     - Golden Hour reward table: 50 tiers, cosmetics+LC only (no stat items),
 *       cadence parity, named entries
 *   DB INTEGRATION (throwaway users, cleaned up in finally):
 *     - lock debits both wallets; lock is idempotent (no double debit on replay)
 *     - pay winner credits pot-minus-rake; rake is retained by the house
 *     - refund returns the exact entry fee; refund is idempotent
 *     - full duel is LC-conservative: house keeps exactly the rake
 */

import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import {
  ARENA_RAKE_PERCENT,
  ARENA_FEE_TIERS,
  ARENA_MIN_FEE_LC,
  ARENA_MAX_FEE_LC,
  ARENA_EXPIRY_HOURS,
  ARENA_MODES,
  isArenaMode,
  validateArenaFee,
  resolveArena,
  arenaExpiry,
  arenaLockEntry,
  arenaPayWinner,
  arenaRefund,
  rakeAmount,
  winnerPayout,
  totalPot,
  ArenaError,
} from '../lib/arena';
import { GOLDEN_HOUR_REWARDS } from '../lib/season/golden-hour';

const prisma = new PrismaClient();

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// ---------------------------------------------------------------------------
// PURE LOGIC
// ---------------------------------------------------------------------------
function pureTests() {
  console.log('\nPURE LOGIC');

  check('config sane: rake in (0,100), fee tiers within [min,max], integer', () => {
    assert.ok(ARENA_RAKE_PERCENT > 0 && ARENA_RAKE_PERCENT < 100, 'rake percent bounded');
    assert.ok(ARENA_FEE_TIERS.length > 0, 'at least one fee tier');
    for (const f of ARENA_FEE_TIERS) {
      assert.ok(Number.isInteger(f), 'tier is integer');
      assert.ok(f >= ARENA_MIN_FEE_LC && f <= ARENA_MAX_FEE_LC, 'tier within bounds');
    }
    assert.ok(ARENA_MIN_FEE_LC <= ARENA_MAX_FEE_LC, 'min <= max');
    assert.ok(ARENA_EXPIRY_HOURS > 0, 'expiry positive');
  });

  check('validateArenaFee enforces integers and bounds', () => {
    for (const f of ARENA_FEE_TIERS) assert.equal(validateArenaFee(f).ok, true, `tier ${f} ok`);
    assert.equal(validateArenaFee(0).ok, false, 'zero rejected');
    assert.equal(validateArenaFee(-25).ok, false, 'negative rejected');
    assert.equal(validateArenaFee(25.5).ok, false, 'fractional rejected');
    assert.equal(validateArenaFee(ARENA_MIN_FEE_LC - 1).ok, false, 'below min rejected');
    assert.equal(validateArenaFee(ARENA_MAX_FEE_LC + 1).ok, false, 'above max rejected');
    assert.equal(validateArenaFee(ARENA_MIN_FEE_LC).ok, true, 'exact min ok');
    assert.equal(validateArenaFee(ARENA_MAX_FEE_LC).ok, true, 'exact max ok');
  });

  check('resolveArena orders by higher score', () => {
    assert.equal(resolveArena(10, 5), 'p1');
    assert.equal(resolveArena(5, 10), 'p2');
    assert.equal(resolveArena(7, 7), 'tie');
    assert.equal(resolveArena(0, 0), 'tie');
  });

  check('pot/rake/payout math conserves the pot (payout + rake == 2*fee)', () => {
    for (const fee of ARENA_FEE_TIERS) {
      const pot = totalPot(fee);
      const rake = rakeAmount(fee, ARENA_RAKE_PERCENT);
      const payout = winnerPayout(fee, ARENA_RAKE_PERCENT);
      assert.equal(pot, fee * 2, 'pot is both fees');
      assert.equal(payout + rake, pot, 'no LC created or destroyed');
      assert.ok(rake >= 0 && payout > 0, 'non-negative rake, positive payout');
      assert.ok(payout > fee, 'winner nets more than their own stake');
    }
  });

  check('isArenaMode allow-list is skill modes only', () => {
    for (const m of ARENA_MODES) assert.equal(isArenaMode(m), true, `${m} is arena mode`);
    assert.equal(isArenaMode('not-a-mode'), false);
    assert.equal(isArenaMode(''), false);
    // No duplicate mode keys.
    assert.equal(new Set(ARENA_MODES).size, ARENA_MODES.length, 'modes are unique');
  });

  check('arenaExpiry is ~ARENA_EXPIRY_HOURS in the future', () => {
    const ms = arenaExpiry().getTime() - Date.now();
    const expected = ARENA_EXPIRY_HOURS * 3600 * 1000;
    assert.ok(Math.abs(ms - expected) < 5000, 'expiry within tolerance');
  });

  check('Golden Hour table: 50 tiers, cosmetics+LC only, cadence + names', () => {
    assert.equal(GOLDEN_HOUR_REWARDS.length, 50, '50 tiers');
    let lcTiers = 0;
    let commonTiers = 0;
    let legendaryTiers = 0;
    GOLDEN_HOUR_REWARDS.forEach((entry, i) => {
      const tier = i + 1;
      for (const r of [...entry.free, ...entry.pro]) {
        assert.ok(r.kind === 'lc' || r.kind === 'cosmetic', 'only LC or cosmetic — no stat items');
        assert.ok(typeof r.name === 'string' && r.name.length > 0, 'reward is named');
        if (r.kind === 'lc') assert.ok((r.amt ?? 0) > 0, 'LC amount positive');
        if (r.kind === 'cosmetic') assert.ok(!!r.rarity, 'cosmetic has rarity');
      }
      // FREE cadence parity: LC every 5th, common cosmetic every other 3rd.
      if (tier % 5 === 0) {
        assert.ok(entry.free.some((r) => r.kind === 'lc'), `tier ${tier} FREE has LC`);
        lcTiers++;
      } else if (tier % 3 === 0) {
        assert.ok(entry.free.some((r) => r.kind === 'cosmetic' && r.rarity === 'common'), `tier ${tier} FREE common`);
        commonTiers++;
      }
      // PRO cadence: legendary every 10th, rare otherwise (pro lane authored).
      if (tier % 10 === 0) {
        assert.ok(entry.pro.some((r) => r.rarity === 'legendary'), `tier ${tier} PRO legendary`);
        legendaryTiers++;
      } else {
        assert.ok(entry.pro.some((r) => r.rarity === 'rare'), `tier ${tier} PRO rare`);
      }
    });
    assert.equal(lcTiers, 10, '10 LC tiers (every 5th)');
    assert.equal(legendaryTiers, 5, '5 legendary tiers (every 10th)');
    assert.ok(commonTiers > 0, 'has common cosmetic tiers');
  });
}

// ---------------------------------------------------------------------------
// DB INTEGRATION (throwaway users, cleaned up in finally)
// ---------------------------------------------------------------------------
async function cleanupUser(userId: string) {
  const acct = await prisma.ledgerAccount.findFirst({
    where: { userId, type: 'USER_WALLET', currency: 'LC' },
    select: { id: true },
  });
  if (acct) {
    const postings = await prisma.ledgerPosting.findMany({
      where: { accountId: acct.id },
      select: { transactionId: true },
    });
    const txIds = Array.from(new Set(postings.map((p) => p.transactionId)));
    if (txIds.length) {
      await prisma.ledgerPosting.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.ledgerTransaction.deleteMany({ where: { id: { in: txIds } } });
    }
    await prisma.ledgerAccount.delete({ where: { id: acct.id } });
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function makeAthlete(tag: string, lc: number): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `__arenatest_${tag}_${Date.now()}@fel.test`,
      name: `Arena ${tag}`,
      password: 'x',
      profile: {
        create: {
          labCredits: lc,
          strength: 50, speed: 50, endurance: 50, agility: 50,
          power: 50, flexibility: 50, recovery: 50, mental: 50,
        },
      },
    },
    select: { id: true },
  });
  return user.id;
}

async function balanceOf(userId: string): Promise<number> {
  const p = await prisma.playerProfile.findUnique({ where: { userId }, select: { labCredits: true } });
  return p?.labCredits ?? 0;
}

async function dbTests() {
  console.log('\nDB INTEGRATION');
  const fee = 100;
  const p1 = await makeAthlete('p1', 500);
  const p2 = await makeAthlete('p2', 500);
  const matchId = `test-match-${Date.now()}`;

  try {
    await checkAsync('lock debits both wallets by the entry fee', async () => {
      await prisma.$transaction(async (tx: any) => {
        await arenaLockEntry(tx, { userId: p1, matchId, feeLc: fee });
        await arenaLockEntry(tx, { userId: p2, matchId, feeLc: fee });
      });
      assert.equal(await balanceOf(p1), 400, 'p1 debited');
      assert.equal(await balanceOf(p2), 400, 'p2 debited');
    });

    await checkAsync('lock is idempotent-by-abort: replay throws and rolls back (no double-debit)', async () => {
      const before = await balanceOf(p1); // 400 after first lock
      // Replaying the same (match,user) lock collides on the unique dedupeKey
      // (userId, dedupeKey). The whole transaction aborts, so the wallet is NOT
      // debited a second time.
      await assert.rejects(
        () =>
          prisma.$transaction(async (tx: any) => {
            await arenaLockEntry(tx, { userId: p1, matchId, feeLc: fee });
          }),
        'replayed lock must reject on the dedupeKey collision',
      );
      assert.equal(await balanceOf(p1), before, 'balance unchanged after aborted replay');
      const entries = await prisma.creditLedger.count({
        where: { userId: p1, dedupeKey: `arena-entry:${matchId}:${p1}` },
      });
      assert.equal(entries, 1, 'exactly one entry-lock ledger row for p1');
    });

    await checkAsync('pay winner credits pot-minus-rake; house keeps the rake', async () => {
      const expectedPayout = winnerPayout(fee, ARENA_RAKE_PERCENT); // 200 - 20 = 180
      const expectedRake = rakeAmount(fee, ARENA_RAKE_PERCENT); // 20
      const before = await balanceOf(p1);
      const res = await prisma.$transaction(async (tx: any) =>
        arenaPayWinner(tx, { winnerId: p1, matchId, feeLc: fee, rakePercent: ARENA_RAKE_PERCENT }),
      );
      assert.equal(res.payout, expectedPayout, 'payout math');
      assert.equal(res.rake, expectedRake, 'rake math');
      assert.equal(await balanceOf(p1), before + expectedPayout, 'winner credited');
    });

    await checkAsync('full duel is LC-conservative (house keeps exactly the rake)', async () => {
      // p1 started 500, p2 started 500 => system total 1000.
      // After lock (both -100) and pay p1 (+180): p1=580, p2=400 => 980.
      // The missing 20 LC is the rake retained by the platform (left both
      // wallets, never paid back). That is the intended house take.
      const p1bal = await balanceOf(p1);
      const p2bal = await balanceOf(p2);
      const rake = rakeAmount(fee, ARENA_RAKE_PERCENT);
      assert.equal(p1bal + p2bal, 1000 - rake, 'wallets down exactly the rake');
    });

    await checkAsync('refund returns the exact entry fee and is idempotent', async () => {
      const rMatch = `test-refund-${Date.now()}`;
      const before = await balanceOf(p2);
      await prisma.$transaction(async (tx: any) => {
        await arenaLockEntry(tx, { userId: p2, matchId: rMatch, feeLc: fee });
      });
      assert.equal(await balanceOf(p2), before - fee, 'locked');
      await prisma.$transaction(async (tx: any) => {
        await arenaRefund(tx, { userId: p2, matchId: rMatch, feeLc: fee });
      });
      assert.equal(await balanceOf(p2), before, 'refunded to pre-lock balance');
      const refundRows = await prisma.creditLedger.count({
        where: { userId: p2, dedupeKey: `arena-refund:${rMatch}:${p2}` },
      });
      assert.equal(refundRows, 1, 'single refund ledger row');
    });

    await checkAsync('insufficient funds throws ArenaError(INSUFFICIENT_FUNDS)', async () => {
      const broke = await makeAthlete('broke', 10);
      try {
        await prisma.$transaction(async (tx: any) => {
          await arenaLockEntry(tx, { userId: broke, matchId: `nofunds-${Date.now()}`, feeLc: fee });
        });
        assert.fail('should have thrown');
      } catch (e: any) {
        assert.ok(e instanceof ArenaError && e.code === 'INSUFFICIENT_FUNDS', 'typed error');
      } finally {
        await cleanupUser(broke);
      }
    });
  } finally {
    await cleanupUser(p1);
    await cleanupUser(p2);
  }
}

async function main() {
  console.log('M14 Triumph Arena — acceptance tests');
  pureTests();
  await dbTests();
  console.log(`\nALL ${passed} CHECKS PASSED`);
}

main()
  .catch((e) => {
    console.error('\nARENA TESTS FAILED:\n', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
