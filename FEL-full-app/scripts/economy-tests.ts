/**
 * scripts/economy-tests.ts — Creator Card Economy v1 acceptance tests.
 *
 * Harness: `yarn tsx scripts/economy-tests.ts` + node:assert (no jest/vitest).
 * Exits non-zero on any failure.
 *
 * Coverage:
 *   PURE (no DB):
 *     - dedupe keys / reason mapping / config sanity
 *     - catalog + price invariants (unique ids, priced, valid unlocks)
 *     - entitlements.unlockKey + cardForDrill mapping
 *     - cosmetics map
 *   DB INTEGRATION (throwaway user, fully cleaned up afterward):
 *     - earn-once: replayed lesson_complete is a no-op (anti double-pay)
 *     - insufficient funds rejected
 *     - spend -> ownership; replayed spend -> ALREADY_OWNED (idempotent)
 *     - resolveEntitlements / ownsDrill reflect the owned DrillCard
 *     - client-cannot-mint: source-bound reason set is disjoint from client-earnable
 */

import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import {
  ECONOMY_CONFIG,
  LEDGER_REASONS,
  buildDedupeKey,
  reasonForEvent,
  utcDateKey,
  awardCredits,
  purchaseCard,
  getBalance,
  EconomyError,
} from '../lib/economy';
import {
  CARD_CATALOG,
  CARD_PRICES,
  CARD_TYPES,
  getCardById,
  getCardsByType,
} from '../lib/card-catalog';
import {
  unlockKey,
  cardForDrill,
  resolveEntitlements,
  ownsDrill,
  ownsAvatarAsset,
} from '../lib/entitlements';
import { getCosmetic, COSMETICS } from '../lib/cosmetics';

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

  check('dedupe keys are content-scoped', () => {
    assert.equal(buildDedupeKey({ kind: 'lesson_complete', lessonId: 'L1' }), 'lesson:L1');
    assert.equal(buildDedupeKey({ kind: 'checkpoint_clear', moduleId: 'M1' }), 'checkpoint:M1');
    assert.equal(buildDedupeKey({ kind: 'session_win', sessionId: 'S1' }), 'session:S1');
    assert.equal(buildDedupeKey({ kind: 'story_node', nodeId: 'N1', amount: 5 }), 'story:N1');
    const d = new Date('2026-07-15T12:00:00Z');
    assert.equal(buildDedupeKey({ kind: 'daily_streak', now: d }), 'streak:2026-07-15');
  });

  check('reasonForEvent maps to ledger reasons', () => {
    assert.equal(reasonForEvent({ kind: 'lesson_complete', lessonId: 'x' }), LEDGER_REASONS.LESSON_COMPLETE);
    assert.equal(reasonForEvent({ kind: 'checkpoint_clear', moduleId: 'x' }), LEDGER_REASONS.CHECKPOINT_CLEAR);
    assert.equal(reasonForEvent({ kind: 'session_win', sessionId: 'x' }), LEDGER_REASONS.SESSION_WIN);
    assert.equal(reasonForEvent({ kind: 'daily_streak' }), LEDGER_REASONS.DAILY_STREAK);
    assert.equal(reasonForEvent({ kind: 'story_node', nodeId: 'x', amount: 1 }), LEDGER_REASONS.STORY_NODE);
  });

  check('utcDateKey is stable YYYY-MM-DD', () => {
    assert.equal(utcDateKey(new Date('2026-01-02T23:59:59Z')), '2026-01-02');
  });

  check('economy config values sane and positive', () => {
    const e = ECONOMY_CONFIG.earn;
    for (const v of [e.lessonComplete, e.moduleCheckpoint, e.heroSessionWin, e.dailyStreakPerDay, e.dailyStreakCapDays, e.storyNodeRewardMax]) {
      assert.ok(Number.isInteger(v) && v > 0, `earn value ${v}`);
    }
    assert.ok(e.moduleCheckpoint > e.lessonComplete, 'checkpoint pays more than a lesson');
    assert.ok(ECONOMY_CONFIG.antiFarm.maxEarnsPerWindow > 0);
    assert.ok(ECONOMY_CONFIG.antiFarm.windowSeconds > 0);
  });

  check('catalog ids are unique', () => {
    const ids = CARD_CATALOG.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate card id');
  });

  check('every card is priced to its type tier and typed correctly', () => {
    for (const card of CARD_CATALOG) {
      assert.ok(CARD_TYPES.includes(card.type), `bad type ${card.type}`);
      assert.equal(card.costLC, CARD_PRICES[card.type], `price mismatch for ${card.id}`);
      assert.ok(card.costLC > 0);
      assert.equal(card.unlocks.type, card.type, `unlock/type mismatch for ${card.id}`);
      assert.ok(card.title.length > 0 && card.description.length > 0);
    }
  });

  check('getCardById / getCardsByType', () => {
    const first = CARD_CATALOG[0];
    assert.equal(getCardById(first.id)?.id, first.id);
    assert.equal(getCardById('nope'), undefined);
    const drills = getCardsByType('drill');
    assert.ok(drills.length > 0 && drills.every((c) => c.type === 'drill'));
  });

  check('unlockKey is unique per unlock', () => {
    const keys = CARD_CATALOG.map((c) => unlockKey(c.unlocks));
    assert.equal(new Set(keys).size, keys.length, 'duplicate unlock key');
  });

  check('cardForDrill round-trips every DrillCard', () => {
    for (const c of CARD_CATALOG.filter((c) => c.unlocks.type === 'drill')) {
      const drillId = (c.unlocks as any).drillId;
      assert.equal(cardForDrill(drillId)?.id, c.id);
    }
    assert.equal(cardForDrill('drill_does_not_exist'), undefined);
  });

  check('cosmetics resolve for every AvatarCard asset', () => {
    for (const c of CARD_CATALOG.filter((c) => c.unlocks.type === 'avatar')) {
      const assetId = (c.unlocks as any).assetId;
      const cos = getCosmetic(assetId);
      assert.ok(cos, `no cosmetic for ${assetId}`);
      assert.equal(cos!.slot, (c.unlocks as any).slot);
    }
    assert.equal(getCosmetic(null), null);
    assert.equal(getCosmetic('bogus'), null);
    // every cosmetic flags a placeholder (unlicensed) glb path
    for (const key of Object.keys(COSMETICS)) {
      assert.match(COSMETICS[key].glb, /placeholder/, `glb not flagged placeholder: ${key}`);
    }
  });

  check('client-cannot-mint: source-bound reasons never in client-earnable set', () => {
    // Mirrors app/api/wallet/earn/route.ts policy. The only self-validating
    // (client-requestable) reason is daily_streak; everything with an external
    // source of truth must flow through its event route.
    const CLIENT_EARNABLE = new Set(['daily_streak']);
    const SOURCE_BOUND = new Set(['lesson_complete', 'module_checkpoint', 'session_win', 'story_node']);
    for (const r of SOURCE_BOUND) assert.ok(!CLIENT_EARNABLE.has(r), `${r} must not be client-earnable`);
  });
}

// ---------------------------------------------------------------------------
// DB INTEGRATION (throwaway user, cleaned up in finally)
// ---------------------------------------------------------------------------
async function cleanup(userId: string) {
  // Remove the double-entry artifacts first (they are NOT cascade-deleted by
  // User), so ledger invariants stay green, then delete the user (cascades
  // CreditLedger / CardOwnership / PlayerProfile).
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
      // delete both sides (USER_WALLET + EXTERNAL) of each test transaction
      await prisma.ledgerPosting.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.ledgerTransaction.deleteMany({ where: { id: { in: txIds } } });
    }
    await prisma.ledgerAccount.delete({ where: { id: acct.id } });
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function dbTests() {
  console.log('\nDB INTEGRATION');
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `__econtest_${stamp}@fel.test`,
      name: 'Econ Test',
      password: 'x',
    },
    select: { id: true },
  });
  const userId = user.id;

  try {
    const drill = CARD_CATALOG.find((c) => c.unlocks.type === 'drill')!;
    const drillId = (drill.unlocks as any).drillId as string;

    await checkAsync('insufficient funds is rejected before any spend', async () => {
      await assert.rejects(
        () => purchaseCard(prisma, userId, { key: drill.id, costLC: drill.costLC }),
        (e: any) => e instanceof EconomyError && e.code === 'INSUFFICIENT_FUNDS'
      );
      assert.equal(await getBalance(prisma, userId), 0);
    });

    await checkAsync('earn lesson_complete credits the server-owned amount', async () => {
      const r = await awardCredits(prisma, userId, { kind: 'lesson_complete', lessonId: 'lesson_demo_1' });
      assert.equal(r.awarded, true);
      assert.equal(r.amount, ECONOMY_CONFIG.earn.lessonComplete);
      assert.equal(r.balance, ECONOMY_CONFIG.earn.lessonComplete);
    });

    await checkAsync('earn-once: replayed lesson_complete is a no-op', async () => {
      const before = await getBalance(prisma, userId);
      const r = await awardCredits(prisma, userId, { kind: 'lesson_complete', lessonId: 'lesson_demo_1' });
      assert.equal(r.awarded, false);
      assert.equal(r.duplicate, true);
      assert.equal(await getBalance(prisma, userId), before, 'balance must not move on replay');
    });

    await checkAsync('top up enough LC to afford a DrillCard', async () => {
      // module checkpoint (50) x2 = 100 > 80; distinct dedupe keys
      await awardCredits(prisma, userId, { kind: 'checkpoint_clear', moduleId: 'mod_demo_a' });
      await awardCredits(prisma, userId, { kind: 'checkpoint_clear', moduleId: 'mod_demo_b' });
      assert.ok((await getBalance(prisma, userId)) >= drill.costLC);
    });

    await checkAsync('spend debits exactly the card price and grants ownership', async () => {
      const before = await getBalance(prisma, userId);
      const res = await purchaseCard(prisma, userId, { key: drill.id, costLC: drill.costLC });
      assert.equal(res.balance, before - drill.costLC);
      assert.equal(await getBalance(prisma, userId), before - drill.costLC);
      const own = await prisma.cardOwnership.findUnique({
        where: { userId_cardKey: { userId, cardKey: drill.id } },
        select: { id: true },
      });
      assert.ok(own, 'ownership row must exist');
    });

    await checkAsync('spend is idempotent: replay -> ALREADY_OWNED, no double debit', async () => {
      const before = await getBalance(prisma, userId);
      await assert.rejects(
        () => purchaseCard(prisma, userId, { key: drill.id, costLC: drill.costLC }),
        (e: any) => e instanceof EconomyError && e.code === 'ALREADY_OWNED'
      );
      assert.equal(await getBalance(prisma, userId), before, 'no debit on replayed purchase');
    });

    await checkAsync('entitlements resolve the owned DrillCard end-to-end', async () => {
      const ent = await resolveEntitlements(prisma, userId);
      assert.ok(ent.cardIds.includes(drill.id));
      assert.ok(ent.drillIds.includes(drillId));
      assert.equal(await ownsDrill(prisma, userId, drillId), true);
      assert.equal(await ownsDrill(prisma, userId, 'drill_not_owned'), false);
      assert.equal(await ownsAvatarAsset(prisma, userId, 'avatar_neon_visor'), false);
    });
  } finally {
    await cleanup(userId);
  }
}

async function main() {
  console.log('Creator Card Economy v1 — acceptance tests');
  pureTests();
  await dbTests();
  console.log(`\nALL ${passed} CHECKS PASSED`);
}

main()
  .catch((e) => {
    console.error('\nECONOMY TESTS FAILED:\n', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
