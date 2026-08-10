#!/usr/bin/env -S npx tsx
/**
 * scripts/ball-handling-tests.ts — Mode 1 Phase 3 proof (headless).
 *
 *   DribbleStateMachine: idle -> speed -> protect -> crossover transitions.
 *   lockTarget: stick aim snaps to the teammate in the cone; no aim falls
 *     back to most-open; empty teammate list is a safe null.
 *   choosePassType: defender in the lane corridor forces bounce; clear lane
 *     stays chest; defender behind the passer doesn't affect the choice.
 *   PassFlight: chest is flat-ish and fast; bounce touches the floor near
 *     the midpoint; both arrive (step returns true at the catch).
 *   syncedShotSpeed: the jumpshot's contact frame coincides with the
 *     meter's green center for representative contest levels.
 *
 * Run: npx tsx scripts/ball-handling-tests.ts
 */

import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import {
  DribbleStateMachine, lockTarget, choosePassType, PassFlight,
  syncedShotSpeed, RELEASE_FRAME_01, PROTECT_RANGE,
} from '../lib/babylon/core/BallHandling';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nDribbleStateMachine');
ok('idle at rest, speed when moving', () => {
  const sm = new DribbleStateMachine();
  assert.equal(sm.update(0.016, { speed01: 0, crossover: false, nearestDefender: 9 }), 'idle');
  assert.equal(sm.update(0.016, { speed01: 0.8, crossover: false, nearestDefender: 9 }), 'speed');
});
ok('tight defender while stationary triggers protect', () => {
  const sm = new DribbleStateMachine();
  assert.equal(sm.update(0.016, { speed01: 0.05, crossover: false, nearestDefender: PROTECT_RANGE - 0.2 }), 'protect');
});
ok('crossover holds its state, then returns to speed', () => {
  const sm = new DribbleStateMachine();
  sm.update(0.016, { speed01: 0.7, crossover: false, nearestDefender: 9 });
  assert.equal(sm.update(0.016, { speed01: 0.9, crossover: true, nearestDefender: 9 }), 'crossover');
  assert.equal(sm.update(0.016, { speed01: 0.9, crossover: false, nearestDefender: 9 }), 'crossover'); // held
  for (let i = 0; i < 40; i++) sm.update(0.016, { speed01: 0.9, crossover: false, nearestDefender: 9 });
  assert.equal(sm.state, 'speed');
});

console.log('\nlockTarget');
const passer = new Vector3(0, 0, 6);
const mates = [
  { id: 'left', pos: new Vector3(-4, 0, 2) },
  { id: 'right', pos: new Vector3(4, 0, 2) },
];
ok('aim left locks the left teammate', () => {
  const t = lockTarget(passer, -1, 0.2, mates, []);
  assert.equal(t?.id, 'left');
});
ok('aim right locks the right teammate', () => {
  const t = lockTarget(passer, 1, 0.2, mates, []);
  assert.equal(t?.id, 'right');
});
ok('no aim falls back to most open', () => {
  const defs = [new Vector3(-4.5, 0, 2.5)];           // smothering the left man
  const t = lockTarget(passer, 0, 0, mates, defs);
  assert.equal(t?.id, 'right');
});
ok('no teammates is a safe null', () => {
  assert.equal(lockTarget(passer, 1, 0, [], []), null);
});

console.log('\nchoosePassType');
const target = new Vector3(0, 0, 0);
ok('clear lane is a chest pass', () => {
  assert.equal(choosePassType(passer, target, []), 'chest');
});
ok('defender in the corridor forces the bounce pass', () => {
  const laneDef = [new Vector3(0, 0, 3)];             // mid-lane
  assert.equal(choosePassType(passer, target, laneDef), 'bounce');
});
ok('defender behind the passer changes nothing', () => {
  const behind = [new Vector3(0, 0, 9)];
  assert.equal(choosePassType(passer, target, behind), 'chest');
});

console.log('\nPassFlight');
ok('chest pass flies flat and arrives', () => {
  const f = new PassFlight();
  const ball = new Vector3(0, 1.2, 6);
  f.start(ball.clone(), new Vector3(0, 1.2, 0), 'chest');
  let minY = 99, arrived = false;
  for (let i = 0; i < 120 && !arrived; i++) {
    arrived = f.step(1 / 60, ball);
    minY = Math.min(minY, ball.y);
  }
  assert.ok(arrived, 'arrived');
  assert.ok(minY > 1.0, `chest pass never dips to the floor (minY=${minY.toFixed(2)})`);
});
ok('bounce pass touches the floor mid-flight and arrives', () => {
  const f = new PassFlight();
  const ball = new Vector3(0, 1.2, 6);
  f.start(ball.clone(), new Vector3(0, 1.2, 0), 'bounce');
  let minY = 99, arrived = false, midY = 99;
  for (let i = 0; i < 120 && !arrived; i++) {
    arrived = f.step(1 / 60, ball);
    minY = Math.min(minY, ball.y);
    if (Math.abs(ball.z - 3) < 0.3) midY = Math.min(midY, ball.y);
  }
  assert.ok(arrived, 'arrived');
  assert.ok(minY < 0.4, `bounce pass hits the deck (minY=${minY.toFixed(2)})`);
  assert.ok(ball.y > 0.8, `catch arrives at chest height (y=${ball.y.toFixed(2)})`);
});

console.log('\nsyncedShotSpeed');
ok('contact frame lands on the green center across contest levels', () => {
  const clipSec = 1.1;                                  // baked jumpshot duration
  for (const contest of [0, 0.5, 1]) {
    const meterDur = 0.72 - contest * 0.22;             // ShotMeter.start()
    const green = 0.62;
    const speed = syncedShotSpeed(clipSec, meterDur, green);
    const clipTimeToContact = (RELEASE_FRAME_01 * clipSec) / speed;
    const meterTimeToGreen = green * meterDur;
    assert.ok(
      Math.abs(clipTimeToContact - meterTimeToGreen) < 1e-9,
      `contest ${contest}: contact ${clipTimeToContact}s vs green ${meterTimeToGreen}s`,
    );
  }
});
ok('degenerate inputs stay safe (speed 1, no NaN)', () => {
  assert.equal(syncedShotSpeed(0, 0.72, 0.62), 1);
  assert.ok(Number.isFinite(syncedShotSpeed(1.1, 0, 0.62)));
});

console.log(`\n${pass} checks green`);
