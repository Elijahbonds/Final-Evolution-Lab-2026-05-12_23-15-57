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
 *
 * Run: yarn tsx scripts/season-pass-core-tests.ts
 */

import assert from 'node:assert';
import { SeasonPassCore, TIER_XP } from '../lib/season/season-pass-core';

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

console.log(`\n\u2705 season-pass-core: ${passed} checks passed`);
