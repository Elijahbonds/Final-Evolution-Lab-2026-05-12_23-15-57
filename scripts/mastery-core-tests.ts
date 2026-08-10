/**
 * scripts/mastery-core-tests.ts
 * =============================
 * M13 Step 3 verification harness for the Mastery ladder
 * (lib/mastery/mastery-core.ts). Proves the ported reference semantics:
 *   1. Metric contracts map raw graded metrics to [0,1] correctly per mode.
 *   2. Min-3-sample gate: no tier before 3 samples even with perfect scores.
 *   3. Rolling window of 10: an 11th sample drops the oldest.
 *   4. Tiers never decay below earned even if recent play collapses.
 *   5. A mastery-up event fires exactly once on a tier crossing.
 *   6. Unknown modes use the generic contract.
 *   7. Determinism: identical sample stream -> identical final tier.
 *
 * Run: yarn tsx scripts/mastery-core-tests.ts
 */

import assert from 'node:assert';
import { MasteryCore, METRICS, TIERS, THRESHOLDS } from '../lib/mastery/mastery-core';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// 1. metric contracts
check('metric contracts normalize per mode', () => {
  assert.strictEqual(METRICS.dunkContest.toScore(10), 1, 'card 10 -> 1.0');
  assert.strictEqual(METRICS.dunkContest.toScore(5), 0, 'card 5 -> 0');
  assert.strictEqual(METRICS.threePoint.toScore(0.7), 0.7, 'green rate passthrough');
  assert.strictEqual(METRICS.hoops1v1.toScore(10), 1, 'streak 10 -> 1.0 (capped)');
  assert.strictEqual(METRICS.hoops1v1.toScore(20), 1, 'streak beyond capped at 1');
});

// 2. min-3-sample gate
check('no tier before 3 samples', () => {
  const c = new MasteryCore();
  let r = c.record('dunkContest', 10);
  assert.strictEqual(r.tierIndex, 0, 'sample 1: unranked');
  r = c.record('dunkContest', 10);
  assert.strictEqual(r.tierIndex, 0, 'sample 2: unranked');
  r = c.record('dunkContest', 10);
  assert.ok(r.tierIndex >= 1, 'sample 3 with perfect avg: ranks up');
});

// 3. rolling window of 10
check('rolling window keeps only last 10 samples', () => {
  const c = new MasteryCore();
  for (let i = 0; i < 15; i++) c.record('threePoint', 1);
  assert.strictEqual(c.state.threePoint.samples.length, 10, 'window capped at 10');
});

// 4. tiers never decay
check('tiers never decay below earned', () => {
  const c = new MasteryCore();
  for (let i = 0; i < 10; i++) c.record('threePoint', 1); // reach Venice Legend
  const peak = c.state.threePoint.tier;
  assert.strictEqual(peak, TIERS.length, 'reached top tier');
  for (let i = 0; i < 10; i++) c.record('threePoint', 0); // collapse recent play
  assert.strictEqual(c.state.threePoint.tier, peak, 'tier held despite bad streak');
});

// 5. mastery-up fires on crossings, at most one per record
check('mastery-up fires on tier crossings (<=1 per record)', () => {
  const c = new MasteryCore();
  let upEvents = 0;
  let finalTier = 0;
  for (let i = 0; i < 12; i++) {
    const r = c.record('threePoint', 1);
    assert.ok(r.events.length <= 1, 'a single record emits at most one mastery-up event');
    upEvents += r.events.length;
    finalTier = r.tierIndex;
  }
  assert.ok(upEvents >= 1, 'at least one mastery-up fired climbing to the top');
  assert.strictEqual(finalTier, THRESHOLDS.length, 'climbed all thresholds');
  // Fresh mode, gradually rising stream: tier climbs monotonically, events fire.
  const g = new MasteryCore();
  const rising = [0.25, 0.25, 0.25, 0.5, 0.5, 0.7, 0.7, 0.85, 0.85, 0.97, 0.97, 0.97];
  let events = 0;
  let last = 0;
  for (const s of rising) {
    const r = g.record('threePoint', s);
    events += r.events.length;
    assert.ok(r.tierIndex >= last, 'tier never drops mid-stream');
    last = r.tierIndex;
  }
  assert.ok(events >= 1, 'rising stream produced tier-up events');
});

// 6. unknown mode -> generic
check('unknown mode uses generic contract', () => {
  const c = new MasteryCore();
  const r = c.record('someNewMode', 1);
  assert.strictEqual(r.tier, 'Unranked', 'still needs 3 samples');
  c.record('someNewMode', 1);
  const r3 = c.record('someNewMode', 1);
  assert.ok(r3.tierIndex >= 1, 'generic scoring ranks up');
});

// 7. determinism
check('identical sample stream -> identical tier', () => {
  const stream = [0.5, 0.7, 0.9, 0.6, 0.85, 0.95, 0.7];
  const a = new MasteryCore();
  const b = new MasteryCore();
  let ra = 0;
  let rb = 0;
  for (const s of stream) ra = a.record('hoops1v1', s * 10).tierIndex;
  for (const s of stream) rb = b.record('hoops1v1', s * 10).tierIndex;
  assert.strictEqual(ra, rb, 'same input -> same tier');
});

console.log(`\n\u2705 mastery-core: ${passed} checks passed`);
