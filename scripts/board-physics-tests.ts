#!/usr/bin/env -S npx tsx
/**
 * scripts/board-physics-tests.ts — Mode 3 Phase 2 proof (headless).
 *
 *   A. Slope response: downhill facing gains speed, uphill bleeds it,
 *      flat is neutral; steepness reads.
 *   B. Balance: lean inertia, instability builds under strain at speed and
 *      decays when centered, wobble/critical thresholds.
 *   C. BoardSync: board pose derives from rider every frame; detaching the
 *      prop throws (the desync guard).
 *
 * Run: npx tsx scripts/board-physics-tests.ts
 */

import assert from 'node:assert';
import { NullEngine, Scene, MeshBuilder, Vector3, TransformNode, ArcRotateCamera } from '@babylonjs/core';
import { sampleSlope, BalanceModel, BoardSync } from '../lib/babylon/core/BoardPhysics';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

function sceneWithRamp(): { scene: Scene; rampTop: Vector3; ground: import('@babylonjs/core').AbstractMesh[] } {
  const scene = new Scene(new NullEngine());
  new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  // a simple ramp: a rotated box you can stand on
  const ramp = MeshBuilder.CreateBox('ramp', { width: 10, height: 0.5, depth: 10 }, scene);
  ramp.position.set(0, 1, 0);
  ramp.rotation.x = -0.3;                    // tilts so +Z is downhill
  ramp.computeWorldMatrix(true);
  scene.render();                             // bake world matrices
  return { scene, rampTop: new Vector3(0, 2.5, 0), ground: [ramp] };
}

console.log('\nA. slope response');
ok('facing downhill gains, facing uphill loses, flat is neutral', () => {
  const { scene, rampTop, ground } = sceneWithRamp();
  const down = sampleSlope(scene, rampTop, Math.PI, ground);      // facing +Z
  const up = sampleSlope(scene, rampTop, 0, ground);              // facing -Z
  assert.ok(down.gravityAlongSlope > 0.5, `downhill accel ${down.gravityAlongSlope.toFixed(2)}`);
  assert.ok(up.gravityAlongSlope < -0.5, `uphill decel ${up.gravityAlongSlope.toFixed(2)}`);
  const flat = new Scene(new NullEngine());
  new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), flat);
  const g = MeshBuilder.CreateGround('g', { width: 10, height: 10 }, flat);
  flat.render();
  const f = sampleSlope(flat, new Vector3(0, 0.5, 0), 0, [g]);
  assert.ok(Math.abs(f.gravityAlongSlope) < 0.01, 'flat neutral');
  assert.ok(down.steepness01 > 0.02 && f.steepness01 < 0.01, `steepness reads (${down.steepness01.toFixed(3)} vs ${f.steepness01.toFixed(3)})`);
});

console.log('\nB. balance model');
ok('lean has inertia; instability builds under strain, decays centered', () => {
  const b = new BalanceModel();
  b.update(DT, 1, 0.9);
  assert.ok(b.lean < 1 && b.lean > 0, 'lean eases in');
  for (let i = 0; i < 120; i++) b.update(DT, 1, 0.95);   // hard lean at speed
  assert.ok(b.instability > 0.3, `instability ${b.instability.toFixed(2)}`);
  for (let i = 0; i < 240; i++) b.update(DT, 0, 0.3);    // centered, slow
  assert.ok(b.instability < 0.1, 'recovered');
});
ok('wobble then critical thresholds engage in order', () => {
  const b = new BalanceModel();
  b.kick(0.5);
  assert.ok(b.wobbling && !b.critical);
  b.kick(0.5);
  assert.ok(b.critical);
});

console.log('\nC. board sync contract');
ok('board pose derives from the rider; detachment throws', () => {
  const scene = new Scene(new NullEngine());
  new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const root = new TransformNode('rider', scene);
  const board = MeshBuilder.CreateBox('board', { width: 0.26, height: 0.06, depth: 0.84 }, scene);
  board.parent = root;
  const sync = new BoardSync(board, root);
  sync.update(0.5, false);
  assert.ok(Math.abs(board.rotation.z + 0.11) < 0.01, 'lean drives board roll');
  root.position.set(5, 2, -3);
  scene.render();
  assert.ok(Vector3.Distance(board.getAbsolutePosition(), root.getAbsolutePosition()) < 0.2,
    'board tracks the rider exactly');
  board.parent = null;
  assert.throws(() => sync.update(0, false), /detached/);
});

console.log(`\n${pass} checks green`);
