#!/usr/bin/env -S npx tsx
/**
 * scripts/first-touch-tests.ts — Mode 5 Phase 3 proof (headless).
 *   A. Touch grading: a well-timed, facing, soft pass cushions dead; a
 *      hot pass with bad timing knocks the ball loose (and it MOVES —
 *      a real 50/50, not a scripted fumble).
 *   B. The loose ball is physical: after a knock, the ball has real
 *      velocity and rolls (anyone can win it).
 *   C. Dribble lead: the ball runs further ahead at sprint than at walk;
 *      it tracks the player but with a beat of physical lag on a cut.
 *
 * Run: npx tsx scripts/first-touch-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { gradeTouch, applyTouch, DribbleTouch } from '../lib/babylon/core/FirstTouch';
import { SoccerBall } from '../lib/babylon/core/SoccerBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. touch grading');
ok('soft + timed + facing = cushioned; hot + mistimed = knocked', () => {
  assert.equal(gradeTouch({ incomingSpeed: 8, touchTiming01: 0.95, facingBall: true, movingAway: false }), 'cushioned');
  assert.equal(gradeTouch({ incomingSpeed: 22, touchTiming01: 0.2, facingBall: false, movingAway: true }), 'knocked');
  assert.equal(gradeTouch({ incomingSpeed: 12, touchTiming01: 0.6, facingBall: true, movingAway: false }), 'controlled');
});

console.log('\nB. the loose ball is real');
ok('a knocked touch deflects the ball with live velocity', () => {
  const b = new SoccerBall({ position: new Vector3(0, 0.11, 0) });
  b.launch(new Vector3(0, 0.11, -4), new Vector3(0, 0, 16));
  applyTouch(b, 'knocked', new Vector3(0, 0, 0), 0);
  assert.ok(b.vel.length() > 2, `ball squirts away (${b.vel.length().toFixed(1)} m/s)`);
  const z0 = b.pos.z;
  for (let i = 0; i < 60; i++) b.step(1 / 60);
  assert.ok(b.pos.z !== z0 || Math.abs(b.pos.x) > 0.5, 'the loose ball travels');
});

console.log('\nC. dribble weight');
ok('the ball leads further at speed and lags a cut', () => {
  const d = new DribbleTouch();
  assert.ok(d.leadDistance(1) > d.leadDistance(0.2) * 2, 'looser at speed');
  const b = new SoccerBall({ position: new Vector3(0, 0.11, 0) });
  const p = new Vector3(0, 0, 0);
  for (let i = 0; i < 30; i++) d.update(b, p, 0, 0.9);
  assert.ok(b.pos.z > 0.3, `ball runs ahead (${b.pos.z.toFixed(2)})`);
  // hard cut: the ball keeps its line a beat (physical, not glued)
  const before = b.pos.x;
  for (let i = 0; i < 6; i++) d.update(b, p, Math.PI / 2, 0.9);
  assert.ok(b.pos.x < 0.4, `cut lag is visible (${(b.pos.x - before).toFixed(2)}m in 0.1s)`);
});

console.log(`\n${pass} checks green`);
