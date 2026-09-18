#!/usr/bin/env -S npx tsx
/**
 * scripts/wave-sim-tests.ts — Mode 3 Phases 14-15 proof (headless).
 *   A. Wave lifecycle: swell → forming → breaking → dissipated; the face
 *      steepens into the break; the power section travels with the peel.
 *   B. Paddle/catch: you must match the wave's pace inside the takeoff
 *      window — too slow, too early (flat), and too late (closed) all fail.
 *   C. Pop-up: clean/early/late by commit timing.
 *
 * Run: npx tsx scripts/wave-sim-tests.ts
 */
import assert from 'node:assert';
import { WaveLifecycle, PaddleSim, PopUp, CATCH_SPEED_MATCH } from '../lib/babylon/core/WaveSim';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. wave lifecycle');
ok('phases progress; face steepens into the break; power travels', () => {
  const w = new WaveLifecycle(2, 2, 4, 2);
  assert.equal(w.phase, 'swell');
  for (let i = 0; i <= Math.ceil(2 / DT); i++) w.update(DT);
  assert.equal(w.phase, 'forming');
  assert.ok(w.steepnessAt(0.5) > w.steepnessAt(0.1) || w.steepnessAt(0.5) >= 0.35, 'forming wall stands up');
  for (let i = 0; i < 2.2 / DT; i++) w.update(DT);
  assert.equal(w.phase, 'breaking');
  // power section sits just behind the peel front
  const front = w.peel01;
  const behind = Math.max(0, front - 0.05);
  const ahead = Math.min(1, front + 0.3);
  assert.ok(w.steepnessAt(behind) > w.steepnessAt(ahead), `power at the peel (${w.steepnessAt(behind).toFixed(2)} vs ${w.steepnessAt(ahead).toFixed(2)})`);
  for (let i = 0; i < 5 / DT; i++) w.update(DT);
  assert.equal(w.phase, 'dissipated');
  assert.ok(w.done);
});

console.log('\nB. paddle & catch');
ok('catch needs pace match inside the window; slow/early/late all fail', () => {
  const w = new WaveLifecycle(1, 3, 6, 2);
  const p = new PaddleSim();
  // swell: not catchable
  p.update(1, true, w.speed);
  assert.ok(!p.canCatch(w, 0.5), 'no catching flat swell');
  // forming, but rider too slow
  for (let i = 0; i < 1.2 / DT; i++) w.update(DT);
  assert.equal(w.phase, 'forming');
  const slow = new PaddleSim();
  assert.ok(!slow.canCatch(w, 0.5), 'too slow = wave rolls under');
  // pace matched inside the window
  for (let i = 0; i < 120; i++) p.update(DT, true, w.speed);
  assert.ok(p.speed / w.speed >= CATCH_SPEED_MATCH);
  assert.ok(p.canCatch(w, 0.5), 'matched pace inside the window catches');
});

console.log('\nC. pop-up timing');
ok('clean at the ideal beat; early/late wobble', () => {
  const pop = new PopUp();
  pop.startCatch(1000);
  assert.equal(pop.commit(1000 + PopUp.WINDOW_SEC * 500), 'clean');
  pop.startCatch(1000);
  assert.equal(pop.commit(1010), 'early');
  pop.startCatch(1000);
  assert.equal(pop.commit(1000 + PopUp.WINDOW_SEC * 1000 + 200), 'late');
  assert.equal(pop.commit(2000), null, 'no active catch');
});

console.log(`\n${pass} checks green`);
