/**
 * scripts/season-pass-core-tests.ts
 * =================================
 * M13 Step 2 verification harness for the Season engine
 * (lib/season/season-pass-core.ts). Proves the ported reference semantics:
 *   1. sessionXp is deterministic and monotonic in its inputs, capped score.
 *   2. addXp clears exactly one tier when given exactly TIER_XP(0).
 *   3. A large XP grant rolls MULTIPLE tier-ups in one call, each emitting a
 *      tier-up event with a reward shape.
 *   4. Reward shape: FREE lane grants LC every 5th tier, common cosmetic on
 *      3rd; PRO lane silent without pro, rare/legendary with pro.
 *   5. Tier cap: XP beyond the final tier never exceeds `tiers`.
 *   6. Rehydration: constructing from a persisted snapshot resumes state.
 *   7. Feedback parity: every tier crossed yields exactly one event.
 *   8-11. Collection: claimable is earned-and-carries-a-reward only, marking is
 *      idempotent, claimed state rehydrates, PRO unlock back-fills.
 *   12-15. DELIVERY: every granted cosmetic resolves to a real wearable, season
 *      items are never purchasable, ids are unique and store-disjoint, and the
 *      coin store never lists them.
 *
 * Run: yarn tsx scripts/season-pass-core-tests.ts
 */

import assert from 'node:assert';
import { SeasonPassCore, TIER_XP } from '../lib/season/season-pass-core';
import { GOLDEN_HOUR_REWARDS, ALL_SEASON_WEARABLES } from '../lib/season/golden-hour';
import {
  getWearable,
  isPurchasableWearable,
  wearablesForSlot,
  allWearablesForSlot,
  WEARABLES,
  SLOTS,
} from '../lib/closet/wearable-catalog';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// 1. sessionXp deterministic + monotonic + capped
check('sessionXp deterministic & bounded', () => {
  const a = SeasonPassCore.sessionXp({ score: 100, won: true, firstOfDayMode: true, questsDone: 1 });
  const b = SeasonPassCore.sessionXp({ score: 100, won: true, firstOfDayMode: true, questsDone: 1 });
  assert.strictEqual(a, b, 'must be deterministic');
  const low = SeasonPassCore.sessionXp({ score: 0, won: false });
  const high = SeasonPassCore.sessionXp({ score: 500, won: true, firstOfDayMode: true, questsDone: 2 });
  assert.ok(high > low, 'more inputs -> more XP');
  // score contribution capped at 220
  const capA = SeasonPassCore.sessionXp({ score: 440 });
  const capB = SeasonPassCore.sessionXp({ score: 100000 });
  assert.strictEqual(capA, capB, 'score XP is capped at 220');
});

// 2. exactly one tier on TIER_XP(0)
check('addXp clears exactly one tier at TIER_XP(0)', () => {
  const c = new SeasonPassCore();
  const r = c.addXp(TIER_XP(0));
  assert.strictEqual(r.tier, 1, 'tier advanced to 1');
  assert.strictEqual(r.into, 0, 'no leftover xp');
  assert.strictEqual(r.events.length, 1, 'one tier-up event');
  assert.strictEqual(r.need, TIER_XP(1), 'need reflects next tier');
});

// 3. multiple tier-ups in one grant
check('addXp rolls multiple tier-ups in one call', () => {
  const c = new SeasonPassCore();
  const big = TIER_XP(0) + TIER_XP(1) + TIER_XP(2) + 10;
  const r = c.addXp(big);
  assert.strictEqual(r.tier, 3, 'crossed three tiers');
  assert.strictEqual(r.into, 10, 'remainder carried');
  assert.strictEqual(r.events.length, 3, 'three events');
  assert.deepStrictEqual(r.events.map((e) => e.tier), [1, 2, 3]);
});

// 4. reward shape
check('reward table shape: free lanes + pro gating', () => {
  const free = new SeasonPassCore({ hasPro: false });
  assert.deepStrictEqual(free.rewardsAt(5).free, [{ kind: 'lc', amt: 50 }], 'LC on 5th');
  assert.deepStrictEqual(free.rewardsAt(3).free, [{ kind: 'cosmetic', rarity: 'common' }], 'common on 3rd');
  assert.deepStrictEqual(free.rewardsAt(3).pro, [], 'no pro rewards without pro');
  const pro = new SeasonPassCore({ hasPro: true });
  assert.deepStrictEqual(pro.rewardsAt(10).pro, [{ kind: 'cosmetic', rarity: 'legendary' }], 'legendary on 10th');
  assert.deepStrictEqual(pro.rewardsAt(7).pro, [{ kind: 'cosmetic', rarity: 'rare' }], 'rare otherwise');
});

// 5. tier cap
check('XP never exceeds final tier', () => {
  const c = new SeasonPassCore({ tiers: 3 });
  const huge = 10_000_000;
  const r = c.addXp(huge);
  assert.strictEqual(r.tier, 3, 'capped at max tier');
  assert.ok(r.events.length === 3, 'exactly tiers events');
});

// 6. rehydration
check('rehydration resumes persisted state', () => {
  const c = new SeasonPassCore({ state: { xp: 50, tier: 4 } });
  assert.strictEqual(c.state.tier, 4);
  assert.strictEqual(c.state.xp, 50);
  const r = c.addXp(TIER_XP(4) - 50);
  assert.strictEqual(r.tier, 5, 'advances from resumed tier');
});

// 7. feedback parity: events == tiers crossed
check('one event per tier crossed (feedback parity)', () => {
  const c = new SeasonPassCore();
  let totalEvents = 0;
  let totalTiers = 0;
  for (let i = 0; i < 20; i++) {
    const r = c.addXp(SeasonPassCore.sessionXp({ score: 300, won: true }));
    totalEvents += r.events.length;
    totalTiers = r.tier;
  }
  assert.strictEqual(totalEvents, totalTiers, 'every tier crossing emitted exactly one event');
});

// 8. collection: only EARNED tiers that carry a reward are claimable
check('claimable lists only earned tiers that carry a reward', () => {
  const c = new SeasonPassCore();
  assert.deepStrictEqual(c.claimable('free'), [], 'nothing claimable at tier 0');
  // Climb to tier 6. FREE rewards are sparse: 3 and 6 (common cosmetic, every
  // 3rd) and 5 (LC, every 5th). Tiers 1, 2, 4 carry nothing and never appear.
  c.addXp(TIER_XP(0) + TIER_XP(1) + TIER_XP(2) + TIER_XP(3) + TIER_XP(4) + TIER_XP(5));
  assert.strictEqual(c.state.tier, 6, 'climbed to tier 6');
  assert.deepStrictEqual(c.claimable('free'), [3, 5, 6], 'sparse free lane');
  assert.deepStrictEqual(c.claimable('pro'), [], 'pro lane silent without pro');
});

// 9. collection is idempotent and never re-offers a collected tier
check('markClaimed is idempotent', () => {
  const c = new SeasonPassCore({ state: { tier: 6 } });
  assert.strictEqual(c.markClaimed(3, 'free'), true, 'first claim takes');
  assert.strictEqual(c.markClaimed(3, 'free'), false, 'second claim is a no-op');
  assert.strictEqual(c.isClaimed(3, 'free'), true);
  assert.deepStrictEqual(c.claimable('free'), [5, 6], 'collected tier drops out');
  assert.strictEqual(c.isClaimed(3, 'pro'), false, 'lanes are independent');
});

// 10. claimed state survives rehydration (server persists the arrays)
check('claimed state rehydrates from a snapshot', () => {
  const c = new SeasonPassCore({ state: { tier: 10, claimed: { free: [3, 5], pro: [] } } });
  assert.strictEqual(c.isClaimed(5, 'free'), true);
  assert.deepStrictEqual(c.claimable('free'), [6, 9, 10], 'only uncollected earned tiers');
});

// 11. buying PRO mid-season exposes every already-earned PRO tier (back-fill)
check('pro unlock back-fills earned tiers', () => {
  const snapshot = { tier: 12, claimed: { free: [], pro: [] } };
  const before = new SeasonPassCore({ hasPro: false, state: snapshot });
  assert.deepStrictEqual(before.claimable('pro'), [], 'nothing while locked');
  const after = new SeasonPassCore({ hasPro: true, state: snapshot });
  assert.strictEqual(after.claimable('pro').length, 12, 'all 12 earned tiers open up');
  assert.deepStrictEqual(
    after.rewardsAt(10).pro,
    [{ kind: 'cosmetic', rarity: 'legendary' }],
    'tier 10 back-fills the legendary',
  );
});

// 12-15. DELIVERY invariants. The pass shipped with 50 tiers of cosmetics that
// resolved to nothing wearable: the ids lived only on grant rows, while the
// closet equips out of its catalog. These are the checks that would have caught
// it, and that keep a future season from authoring an unwearable reward.
check('every cosmetic the season grants resolves to a wearable', () => {
  let cosmetics = 0;
  for (const tier of GOLDEN_HOUR_REWARDS) {
    for (const r of [...tier.free, ...tier.pro]) {
      if (r.kind !== 'cosmetic') continue;
      cosmetics++;
      assert.ok(r.id, 'every cosmetic reward carries an id');
      const w = getWearable(r.id!);
      assert.ok(w, `granted cosmetic ${r.id} must resolve in the closet catalog`);
      assert.ok(SLOTS.includes(w!.slot), `${r.id} must sit in a real slot`);
      assert.strictEqual(w!.name, r.name, `${r.id} name must match the reward`);
    }
  }
  assert.ok(cosmetics > 50, `expected a full season of cosmetics, saw ${cosmetics}`);
});

check('season cosmetics are never for sale', () => {
  for (const w of ALL_SEASON_WEARABLES) {
    assert.strictEqual(isPurchasableWearable(w.itemId), false, `${w.itemId} must not be buyable`);
  }
  assert.strictEqual(isPurchasableWearable('top_lab'), true, 'store items stay buyable');
});

check('season item ids are unique and never collide with store ids', () => {
  const seen = new Set<string>();
  for (const w of ALL_SEASON_WEARABLES) {
    assert.ok(!seen.has(w.itemId), `duplicate season item id ${w.itemId}`);
    seen.add(w.itemId);
    assert.ok(!WEARABLES.some((s) => s.itemId === w.itemId), `${w.itemId} collides with a store item`);
  }
});

check('the store never lists season items, the closet always can wear them', () => {
  for (const slot of SLOTS) {
    for (const w of wearablesForSlot(slot)) {
      assert.ok(isPurchasableWearable(w.itemId), `${w.itemId} is listed for sale but is not purchasable`);
    }
  }
  const wearableEverywhere = SLOTS.flatMap((s) => allWearablesForSlot(s).map((w) => w.itemId));
  for (const w of ALL_SEASON_WEARABLES) {
    assert.ok(wearableEverywhere.includes(w.itemId), `${w.itemId} must be wearable in some slot`);
  }
  for (const s of WEARABLES) {
    assert.ok(wearableEverywhere.includes(s.itemId), `${s.itemId} must stay wearable`);
  }
});

// 16-18. PACING. The curve is a product decision, so the intent is asserted
// here rather than left in a comment: the pass shipped costing 187,000 XP over
// a 56-day season \u2014 roughly seven capped wins a day \u2014 so tier 50 and the
// legendary the PRO lane sells were unreachable. These checks hold the shape.
const SEASON_DAYS = 56;

/** XP a profile earns in a day. First-of-day bonus applies once PER MODE. */
function dailyXp(sessions: number, modes: number, winRate: number): number {
  let xp = 0;
  for (let i = 0; i < sessions; i++) {
    xp += SeasonPassCore.sessionXp({
      score: 400,
      won: i / sessions < winRate,
      firstOfDayMode: i < modes,
    });
  }
  return xp;
}

/** Play a whole season at a fixed daily rate; returns the tier reached. */
function playSeason(perDay: number): { tier: number; finishedOn: number | null } {
  const core = new SeasonPassCore();
  let finishedOn: number | null = null;
  for (let day = 1; day <= SEASON_DAYS; day++) {
    core.addXp(perDay);
    if (core.state.tier >= 50 && finishedOn === null) finishedOn = day;
  }
  return { tier: core.state.tier, finishedOn };
}

check('a committed athlete can finish the track inside the season', () => {
  const { tier, finishedOn } = playSeason(dailyXp(4, 3, 0.6));
  assert.strictEqual(tier, 50, `committed play must reach tier 50, reached ${tier}`);
  assert.ok(finishedOn !== null && finishedOn <= SEASON_DAYS, 'must finish within the season');
});

check('a dedicated athlete finishes with room to spare', () => {
  const { finishedOn } = playSeason(dailyXp(6, 4, 0.7));
  assert.ok(finishedOn !== null, 'dedicated play must finish');
  assert.ok(finishedOn! <= 45, `should finish well before the end, finished day ${finishedOn}`);
});

check('the track still means something: casual play does not finish it', () => {
  const { tier } = playSeason(dailyXp(2, 2, 0.5));
  assert.ok(tier < 50, `casual play must not complete the track, reached ${tier}`);
  assert.ok(tier >= 25, `casual play should still see most of the track, reached ${tier}`);
});

console.log(`\n\u2705 season-pass-core: ${passed} checks passed`);
