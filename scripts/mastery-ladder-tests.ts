#!/usr/bin/env -S yarn tsx
/**
 * scripts/mastery-ladder-tests.ts
 * ===============================
 * Verification harness for the player-facing mastery ladder read
 * (lib/mastery/mastery-ladder.ts). The ladder is what an athlete reads to
 * answer "am I getting better?", so its honesty invariants matter as much as
 * its arithmetic:
 *
 *   1. Tier bands agree with MasteryCore — the page can never disagree with
 *      the engine that awarded the badge.
 *   2. The min-3-sample gate is reflected, not papered over.
 *   3. Progress inside a band is measured against the REAL band floor, so a
 *      fresh Silver reads near 0% of the way to Gold, not near 100%.
 *   4. `holdingTier` tells the truth when an earned tier outranks live form
 *      (tiers never decay — the page must not hide the dip).
 *   5. Trend needs evidence: it stays 'new' until there is a full recent
 *      window AND earlier samples to compare against.
 *   6. Guidance never promises a next tier at the top of the ladder.
 *   7. Unknown modes get a readable label and the generic metric contract.
 *   8. Ordering puts ranked modes first, then closest-to-promotion.
 *   9. Determinism: same snapshot -> identical ladder.
 *
 * Run: yarn tsx scripts/mastery-ladder-tests.ts
 */

import assert from 'node:assert';
import { MasteryCore, THRESHOLDS, TIERS, type MasteryModeState } from '../lib/mastery/mastery-core';
import {
  MIN_SAMPLES,
  TREND_WINDOW,
  buildLadder,
  labelForMode,
  rungFor,
  tierForAverage,
  trendOf,
} from '../lib/mastery/mastery-ladder';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const snap = (samples: number[], tier = 0): MasteryModeState => ({ samples, tier });
/** n samples all of value v. */
const flat = (v: number, n: number) => Array.from({ length: n }, () => v);

// ---------------------------------------------------------------------------
console.log('\nBAND ARITHMETIC');

check('tierForAverage matches MasteryCore thresholds exactly', () => {
  // Below the first threshold is Unranked; each threshold promotes one tier.
  assert.strictEqual(tierForAverage(0.0, 10), 0);
  assert.strictEqual(tierForAverage(THRESHOLDS[0] - 0.001, 10), 0);
  for (let i = 0; i < THRESHOLDS.length; i++) {
    assert.strictEqual(tierForAverage(THRESHOLDS[i], 10), i + 1, `threshold ${i} promotes to tier ${i + 1}`);
  }
  assert.strictEqual(tierForAverage(1, 10), TIERS.length, 'a perfect window tops the ladder');
});

check('ladder tier agrees with what MasteryCore actually awards', () => {
  // Drive the real engine, then read the ladder off its own persisted state.
  const core = new MasteryCore();
  for (let i = 0; i < 8; i++) core.record('generic', 0.7);
  const state = core.state.generic;
  const rung = rungFor('generic', state);
  assert.strictEqual(rung.tierIndex, state.tier, 'earned tier is read straight from the snapshot');
  assert.strictEqual(rung.liveTierIndex, state.tier, 'steady form: live tier equals earned tier');
  assert.strictEqual(rung.tierName, TIERS[state.tier - 1]);
});

check('min-3-sample gate is reflected, not papered over', () => {
  const r1 = rungFor('generic', snap([1, 1]));
  assert.strictEqual(r1.tierIndex, 0, 'two perfect samples still rank nothing');
  assert.strictEqual(r1.liveTierIndex, 0);
  assert.strictEqual(r1.samplesUntilRanked, MIN_SAMPLES - 2);
  assert.match(r1.guidance, /1 more graded session to rank/, 'guidance counts sessions, singular');

  const r2 = rungFor('generic', snap([1, 1, 1], 5));
  assert.strictEqual(r2.samplesUntilRanked, 0, 'at the gate, nothing is owed');
});

check('unplayed mode reads as unplayed', () => {
  const r = rungFor('golf', snap([]));
  assert.strictEqual(r.sampleCount, 0);
  assert.strictEqual(r.tierIndex, 0);
  assert.strictEqual(r.samplesUntilRanked, MIN_SAMPLES);
  assert.match(r.guidance, /^Unplayed/);
});

// ---------------------------------------------------------------------------
console.log('\nPROGRESS INSIDE A BAND');

check('progress is measured from the band floor, not from zero', () => {
  // Sitting exactly ON the Silver threshold means 0% of the way to Gold —
  // measuring from zero would flatter this to ~69%.
  const justSilver = rungFor('generic', snap(flat(THRESHOLDS[1], 5)));
  assert.strictEqual(justSilver.liveTierIndex, 2, 'that average is Silver');
  assert.strictEqual(justSilver.progressToNext, 0, 'fresh into the band = 0% toward the next');

  // Halfway between Silver and Gold reads as ~50%.
  const mid = (THRESHOLDS[1] + THRESHOLDS[2]) / 2;
  const halfway = rungFor('generic', snap(flat(mid, 5)));
  assert.ok(
    Math.abs(halfway.progressToNext - 0.5) < 0.01,
    `halfway through the band should read ~0.5, got ${halfway.progressToNext}`,
  );
});

check('gapToNext is the real distance to the next threshold', () => {
  const r = rungFor('generic', snap(flat(0.5, 5)));
  assert.strictEqual(r.nextThreshold, THRESHOLDS[2], 'next up from 0.5 is Gold');
  assert.ok(Math.abs(r.gapToNext - (THRESHOLDS[2] - 0.5)) < 1e-9);
  assert.match(r.guidance, /to reach Gold/);
});

check('top of the ladder promises nothing further', () => {
  const r = rungFor('generic', snap(flat(1, 5), 5));
  assert.strictEqual(r.liveTierIndex, TIERS.length);
  assert.strictEqual(r.nextTierName, null, 'no tier above Venice Legend');
  assert.strictEqual(r.nextThreshold, null);
  assert.strictEqual(r.gapToNext, 0);
  assert.strictEqual(r.progressToNext, 1);
  assert.doesNotMatch(r.guidance, /to reach/, 'never dangles a nonexistent next tier');
});

// ---------------------------------------------------------------------------
console.log('\nHONESTY: EARNED VS LIVE FORM');

check('holdingTier is true when an earned badge outranks current form', () => {
  // Earned Gold (3), but the rolling window has collapsed to Bronze form.
  const r = rungFor('generic', snap(flat(0.25, 10), 3));
  assert.strictEqual(r.tierIndex, 3, 'earned tier never decays');
  assert.strictEqual(r.liveTierIndex, 1, 'live form is Bronze');
  assert.strictEqual(r.holdingTier, true);
  assert.match(r.guidance, /never decays/, 'the dip is stated, not hidden');
  assert.match(r.guidance, /slipped/);
});

check('holdingTier is false when form matches or exceeds the earned tier', () => {
  const steady = rungFor('generic', snap(flat(0.7, 10), 3));
  assert.strictEqual(steady.holdingTier, false);
  // Form ahead of the badge (promotion lands on the next recorded sample).
  const ahead = rungFor('generic', snap(flat(0.9, 10), 3));
  assert.strictEqual(ahead.liveTierIndex, 4);
  assert.strictEqual(ahead.holdingTier, false);
});

check('progress is never inflated past the band it is in', () => {
  for (const v of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 1]) {
    const r = rungFor('generic', snap(flat(v, 6)));
    assert.ok(r.progressToNext >= 0 && r.progressToNext <= 1, `progress in range for avg ${v}`);
  }
});

// ---------------------------------------------------------------------------
console.log('\nTREND');

check('trend stays "new" without enough evidence', () => {
  assert.strictEqual(trendOf([]), 'new');
  assert.strictEqual(trendOf([0.9, 0.9, 0.9]), 'new', 'a full window with nothing earlier to compare');
  assert.strictEqual(trendOf(flat(0.5, TREND_WINDOW)), 'new');
});

check('trend reads rising / falling / steady off the recent window', () => {
  assert.strictEqual(trendOf([0.2, 0.2, 0.9, 0.9, 0.9]), 'rising');
  assert.strictEqual(trendOf([0.9, 0.9, 0.2, 0.2, 0.2]), 'falling');
  assert.strictEqual(trendOf(flat(0.6, 8)), 'steady', 'no movement is not a trend');
});

check('a tiny wobble is not called a trend', () => {
  // Below TREND_EPSILON — real sessions are noisy and the page must not
  // announce improvement that is not there.
  assert.strictEqual(trendOf([0.5, 0.5, 0.5, 0.5, 0.51, 0.51, 0.51]), 'steady');
});

// ---------------------------------------------------------------------------
console.log('\nMODES AND ORDERING');

check('known modes get real names; unknown modes stay readable', () => {
  assert.strictEqual(labelForMode('dunkContest'), 'Dunk Contest');
  assert.strictEqual(labelForMode('irl'), 'Hang Time');
  assert.strictEqual(labelForMode('someFutureMode'), 'Some Future Mode', 'camelCase humanizes');
  assert.strictEqual(labelForMode('court-carnival'), 'Court carnival', 'slugs humanize');
});

check('a mode with a bespoke metric contract reports that metric', () => {
  assert.strictEqual(rungFor('dunkContest', snap([0.5])).metricLabel, 'avg judge card');
  assert.strictEqual(rungFor('threePoint', snap([0.5])).metricLabel, 'green rate');
  assert.strictEqual(rungFor('golf', snap([0.5])).metricLabel, 'grade quality', 'unknown -> generic');
});

check('ladder orders ranked first, then closest to promotion', () => {
  const ladder = buildLadder({
    unplayed: snap([]),
    // Gold, deep into the band.
    strong: snap(flat(0.78, 6), 3),
    // Bronze.
    weak: snap(flat(0.3, 6), 1),
    // Also Gold, but only just into the band.
    freshGold: snap(flat(THRESHOLDS[2] + 0.001, 6), 3),
  });
  assert.deepStrictEqual(
    ladder.rungs.map((r) => r.mode),
    ['strong', 'freshGold', 'weak', 'unplayed'],
  );
});

check('ladder totals count what they say they count', () => {
  const ladder = buildLadder({
    a: snap(flat(0.9, 6), 4),
    b: snap(flat(0.3, 6), 1),
    c: snap([0.5, 0.5], 0), // played, not yet ranked
    d: snap([]), // never played
  });
  assert.strictEqual(ladder.ranked, 2, 'only tiered modes count as ranked');
  assert.strictEqual(ladder.inProgress, 1, 'played-but-unranked counts once; unplayed does not');
  assert.strictEqual(ladder.totalTierPoints, 5);
  assert.strictEqual(ladder.peakTierIndex, 4);
});

check('an empty ladder is empty, not zeroed nonsense', () => {
  const ladder = buildLadder({});
  assert.deepStrictEqual(ladder.rungs, []);
  assert.strictEqual(ladder.ranked, 0);
  assert.strictEqual(ladder.inProgress, 0);
  assert.strictEqual(ladder.totalTierPoints, 0);
  assert.strictEqual(ladder.peakTierIndex, 0);
});

check('only the rolling window counts, even if more was persisted', () => {
  // A snapshot carrying more than WINDOW samples must read off the last 10 —
  // the same window MasteryCore keeps.
  const long = [...flat(0, 20), ...flat(1, 10)];
  const r = rungFor('generic', snap(long));
  assert.strictEqual(r.sampleCount, 10);
  assert.strictEqual(r.avg, 1, 'the stale leading zeros are outside the window');
});

check('same snapshot yields an identical ladder', () => {
  const input = { a: snap(flat(0.7, 6), 3), b: snap([0.2, 0.9, 0.4], 1) };
  assert.deepStrictEqual(buildLadder(input), buildLadder(input));
});

console.log(`\nmastery-ladder-tests: ${passed} checks passed`);
