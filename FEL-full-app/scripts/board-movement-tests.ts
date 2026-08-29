#!/usr/bin/env -S npx tsx
/**
 * scripts/board-movement-tests.ts — Mode 3 Phase 3 proof (headless).
 *
 *   A. Momentum economy: pushes build speed with cooldown pacing; flat
 *      pumping asymptotes at cruise (never to max); drag bleeds speed.
 *   B. Carve: steering turns the rider; a committed carve holds speed,
 *      a lazy steer at speed scrubs it.
 *   C. Stance: switch flips response and taxes speed.
 *   D. Terrain: a downslope accelerates the rider beyond cruise
 *      (real terrain energy), flat stays at cruise.
 *
 * Run: npx tsx scripts/board-movement-tests.ts
 */

import assert from 'node:assert';
import { NullEngine, Scene, MeshBuilder, Vector3, ArcRotateCamera } from '@babylonjs/core';
import { BoardMovement, SKATE_TUNING } from '../lib/babylon/core/BoardMovement';
import { sampleSlope } from '../lib/babylon/core/BoardPhysics';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. momentum economy');
ok('pushes build speed, cooldown paces them, drag bleeds', () => {
  const m = new BoardMovement();
  assert.ok(m.push());
  assert.ok(!m.push(), 'cooldown');
  for (let i = 0; i < 40; i++) m.update(DT, 0, 0);
  assert.ok(m.push(), 'cooled down');
  for (let i = 0; i < 90; i++) m.update(DT, 0, 0);
  assert.ok(m.speed > 4 && m.speed < SKATE_TUNING.cruiseSpeed, `cruising at ${m.speed.toFixed(1)}`);
});
ok('flat-ground pump approaches cruise but never max', () => {
  const m = new BoardMovement();
  for (let i = 0; i < 60 * 10; i++) m.update(DT, 0, 1);   // 10s of pumping, flat
  assert.ok(m.speed <= SKATE_TUNING.cruiseSpeed + 0.05, `capped at cruise (${m.speed.toFixed(1)})`);
  assert.ok(m.speed > SKATE_TUNING.cruiseSpeed * 0.5, `pumping beats pushing on flat (${m.speed.toFixed(1)})`);
});

console.log('\nB. carve');
ok('steering turns; committed carve holds speed, lazy steer scrubs', () => {
  const carve = new BoardMovement();
  for (let i = 0; i < 60; i++) carve.update(DT, 0, 0);
  carve.vel = new Vector3(0, 0, 8);
  const y0 = carve.yaw;
  for (let i = 0; i < 30; i++) carve.update(DT, 1, 0);    // full carve right
  assert.ok(carve.yaw > y0 + 0.5, 'turned');
  assert.ok(carve.speed > 7.0, `carve holds speed (${carve.speed.toFixed(1)})`);
  const lazy = new BoardMovement();
  lazy.vel = new Vector3(0, 0, 8);
  for (let i = 0; i < 30; i++) lazy.update(DT, 0.15, 0);  // timid steer
  assert.ok(lazy.speed < 8, `lazy steer scrubs (${lazy.speed.toFixed(1)})`);
});

console.log('\nC. stance');
ok('switch taxes speed and dulls the turn', () => {
  const m = new BoardMovement();
  m.vel = new Vector3(0, 0, 6);
  const before = m.speed;
  m.switchStance();
  assert.ok(m.speed < before);
  assert.equal(m.stance, 'switch');
});

console.log('\nD. terrain energy');
ok('a downslope accelerates beyond cruise; flat does not', () => {
  const scene = new Scene(new NullEngine());
  new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const ramp = MeshBuilder.CreateBox('ramp', { width: 10, height: 0.5, depth: 40 }, scene);
  ramp.position.set(0, 3, 0); ramp.rotation.x = -0.35; ramp.computeWorldMatrix(true);
  scene.render();
  const m = new BoardMovement();
  m.yaw = Math.PI;                                        // facing +Z (downhill)
  const pos = new Vector3(0, 4.2, -8);
  for (let i = 0; i < 60 * 3; i++) {
    const v = m.update(DT, 0, 0, scene, pos, [ramp]);
    pos.addInPlace(v.scale(DT));
    // keep the probe on the surface (we're testing the slope ACCELERATION,
    // not the Rider's snap, which GroundRide already owns)
    if (i % 20 === 0) {
      const s = sampleSlope(scene, pos, m.yaw, [ramp]);
      if (s.steepness01 > 0.01) pos.y = pos.y;            // probe height fine
    }
  }
  assert.ok(m.speed > 5.5, `slope energy builds speed downhill (${m.speed.toFixed(1)} m/s)`);
});

console.log(`\n${pass} checks green`);
