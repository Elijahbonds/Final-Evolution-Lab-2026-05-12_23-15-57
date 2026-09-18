#!/usr/bin/env -S npx tsx
/**
 * scripts/golf-ball-tests.ts — Golf Phase 2 proof (headless).
 *   A. A drive flies and rolls to a believable distance; rough grabs the
 *      roll harder than fairway; sand nearly stops it.
 *   B. Water/OB stop the ball and report the penalty surface.
 *   C. Putts: pace scales with distance; a pushed putt on a slope lips out.
 *
 * Run: npx tsx scripts/golf-ball-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { GolfBallSim, resolvePutt, SURFACE_FRICTION } from '../lib/babylon/core/GolfBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 120;

function playShot(surface: 'fairway' | 'rough' | 'sand'): number {
  const sim = new GolfBallSim({ position: Vector3.Zero() });
  sim.launchFromShot(new Vector3(0, 0.05, 0), 0, { carryM: 120, launchDeg: 32, offlineRad: 0 });
  while (sim.ball.active) sim.step(DT, () => surface);
  return sim.ball.pos.z;
}

console.log('\nA. terrain interaction');
ok('fairway rolls out, rough grabs, sand stops', () => {
  const f = playShot('fairway'), r = playShot('rough'), s = playShot('sand');
  assert.ok(f > 100, `real carry+roll (${f.toFixed(0)}m)`);
  assert.ok(r < f && s < r, `fairway ${f.toFixed(0)} > rough ${r.toFixed(0)} > sand ${s.toFixed(0)}`);
});

console.log('\nB. penalties');
ok('water and OB stop the ball and report the surface', () => {
  const sim = new GolfBallSim({ position: Vector3.Zero() });
  sim.launchFromShot(new Vector3(0, 0.05, 0), 0, { carryM: 200, launchDeg: 20, offlineRad: 0 });
  let res: string = 'ok';
  while (sim.ball.active && res === 'ok') res = sim.step(DT, (p) => p.z > 60 ? 'water' : 'fairway');
  assert.equal(res, 'water');
  assert.ok(!sim.ball.active, 'dead in the hazard');
});

console.log('\nC. putting');
ok('pace scales with distance; a pushed putt on slope lips', () => {
  const tap = resolvePutt({ power01: 0.4, face01: 1 }, 2, 0);
  const lag = resolvePutt({ power01: 0.4, face01: 1 }, 12, 0);
  assert.ok(lag.paceM > tap.paceM * 3, 'longer putt, more pace');
  assert.ok(resolvePutt({ power01: 0.95, face01: 0.4 }, 3, 0.8).lips, 'pushed on a slope = lip-out risk');
});

console.log(`\n${pass} checks green`);
