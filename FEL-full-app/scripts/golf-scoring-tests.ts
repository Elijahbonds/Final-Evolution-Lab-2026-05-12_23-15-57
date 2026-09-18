#!/usr/bin/env -S npx tsx
/**
 * scripts/golf-scoring-tests.ts — Golf Phases 4+5 proof (headless).
 *   A. Scorecard math: labels derive from strokes-vs-par; to-par totals.
 *   B. Game-Breaker: eagle/ace fire, birdie doesn't.
 *   C. PRQ mapping is precision/consistency-dominant and capped.
 *   D. Cameras: tee vs green presets are distinct reads.
 */
import assert from 'node:assert';
import { Scorecard, scoreLabel, isGameBreaker, GOLF_PRQ, GOLF_INFLUENCE_CAP } from '../lib/babylon/core/GolfScoring';
import { TEST_COURSE } from '../lib/babylon/core/GolfCourse';
import { FOLLOW_PRESETS } from '../lib/babylon/core/CameraDirector';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. scorecard');
ok('labels derive from par; to-par totals correctly', () => {
  const sc = new Scorecard();
  sc.record(TEST_COURSE.holes[0], 3);   // birdie on the par 4
  sc.record(TEST_COURSE.holes[1], 3);   // par on the par 3
  sc.record(TEST_COURSE.holes[2], 6);   // bogey on the par 5
  assert.equal(scoreLabel(4, 3), 'BIRDIE');
  assert.equal(scoreLabel(3, 1), 'HOLE IN ONE');
  assert.equal(scoreLabel(5, 3), 'EAGLE');
  assert.equal(sc.toPar, 0);
  assert.equal(sc.through, 3);
});

console.log('\nB. Game-Breaker (golf definition)');
ok('eagle/ace fire the beat; birdie does not', () => {
  assert.ok(isGameBreaker(4, 2));
  assert.ok(isGameBreaker(3, 1));
  assert.ok(!isGameBreaker(4, 3));
});

console.log('\nC. PRQ mapping');
ok('precision/consistency dominate; influence is capped', () => {
  assert.ok(GOLF_PRQ.precision > 0.7 && GOLF_PRQ.consistency > 0.7);
  assert.ok(GOLF_PRQ.combat === 0 && GOLF_PRQ.kinetic < 0.2);
  assert.ok(GOLF_INFLUENCE_CAP <= 0.6, 'golf never out-earns contact modes');
});

console.log('\nD. cameras');
ok('tee and green presets are distinct', () => {
  const t = FOLLOW_PRESETS.golfTee, g = FOLLOW_PRESETS.golfGreen;
  assert.ok(t && g);
  assert.ok(t.distance > g.distance && t.lookAhead > g.lookAhead, 'tee reads the hole, green reads the putt');
});

console.log(`\n${pass} checks green`);
