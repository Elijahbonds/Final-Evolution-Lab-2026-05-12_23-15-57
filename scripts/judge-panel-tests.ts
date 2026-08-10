#!/usr/bin/env -S npx tsx
/**
 * scripts/judge-panel-tests.ts — Mode 1 Phase 7 proof (headless).
 *
 *   A. judgeDunk: three persona lenses produce in-band scores; difficulty
 *      monsters move Prime more than Silk (lens sanity).
 *   B. planReveal: the reveal is STAGED — Silk first, Prime last, a drum
 *      beat before Prime, total after all cards, and it takes real time
 *      (beats NBA Live's instant flash by design).
 *   C. ScoreReveal driver: beats fire in order over frames; no beat fires
 *      twice; the plan completes and deactivates.
 *   D. CrowdEnergy: eruption maxes it, a blown dunk hushes it, live drift
 *      rises with hype and settles slowly.
 *
 * Run: npx tsx scripts/judge-panel-tests.ts
 */

import assert from 'node:assert';
import {
  judgeDunk, planReveal, ScoreReveal, CrowdEnergy, totalBand, REVEAL_DURATION_SEC,
} from '../lib/babylon/core/JudgePanel';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. judging');
ok('scores are in 6..10 and persona lenses differ', () => {
  const lowDiff = judgeDunk(2, 9, 9);
  const highDiff = judgeDunk(9, 9, 9);
  for (const s of highDiff) assert.ok(s.score >= 6 && s.score <= 10);
  const prime = (arr: ReturnType<typeof judgeDunk>) => arr.find((x) => x.name === 'Prime')!.score;
  const silk = (arr: ReturnType<typeof judgeDunk>) => arr.find((x) => x.name === 'Silk')!.score;
  assert.ok(prime(highDiff) - prime(lowDiff) >= silk(highDiff) - silk(lowDiff),
    'Prime (difficulty lens) must swing more than Silk on a difficulty jump');
});

console.log('\nB. reveal plan');
ok('staged: Silk → Doc → drum → Prime → total, spread over ~4s', () => {
  const plan = planReveal(judgeDunk(9, 9, 9));
  assert.equal(plan[0].kind, 'confer');
  assert.equal(plan[1].judge?.name, 'Silk');
  assert.equal(plan[2].judge?.name, 'Doc');
  assert.equal(plan[3].kind, 'drum');
  assert.ok(plan[3].at > plan[2].at, 'drum AFTER Doc — the long beat before Prime');
  assert.equal(plan[4].judge?.name, 'Prime');
  assert.equal(plan[5].kind, 'total');
  assert.ok(plan[5].at >= 3.8, `total lands at ${plan[5].at}s — real anticipation`);
  assert.ok(plan[5].total === plan.slice(1, 5).filter(b => b.judge).reduce((s, b) => s + b.judge!.score, 0));
});
ok('score bands map to crowd reactions', () => {
  assert.equal(totalBand(29), 'eruption');
  assert.equal(totalBand(25), 'approval');
  assert.equal(totalBand(21), 'tepid');
  assert.equal(totalBand(18), 'hush');
});

console.log('\nC. reveal driver');
ok('beats fire in order, once each, then complete', () => {
  const r = new ScoreReveal();
  r.start(judgeDunk(8, 8, 8));
  const fired: string[] = [];
  for (let i = 0; i < Math.ceil((REVEAL_DURATION_SEC + 0.5) * 60); i++) {
    for (const b of r.update(1 / 60)) fired.push(b.kind);
  }
  assert.deepEqual(fired, ['confer', 'card', 'card', 'drum', 'card', 'total']);
  assert.equal(r.active, false);
  assert.equal(r.update(0.016).length, 0, 'no beats after completion');
});

console.log('\nD. crowd energy');
ok('eruption maxes, hush hushes, drift follows hype', () => {
  const c = new CrowdEnergy();
  c.onScore(29);
  assert.ok(c.level > 0.95);
  c.onScore(18);
  assert.ok(c.level < 0.25);
  for (let i = 0; i < 300; i++) c.update(1 / 60, 1, 3, true);
  assert.ok(c.level > 0.8, `hype+chain+on_fire lifts the building (level ${c.level.toFixed(2)})`);
});

console.log(`\n${pass} checks green`);
