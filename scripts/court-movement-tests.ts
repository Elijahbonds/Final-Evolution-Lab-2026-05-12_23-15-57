#!/usr/bin/env -S npx tsx
/**
 * scripts/court-movement-tests.ts — Mode 1 Phase 2 proof.
 *
 * A. WEIGHT CURVES (pure model, no engine):
 *    1. sprint takes real time to reach top speed (not instant)
 *    2. stop-at-sprint is fast but not instant, and faster than accel
 *    3. plant-and-cut at speed bleeds speed (cutting costs momentum)
 *    4. cutting from a jog is nearly free (no over-punishment)
 *    5. stick circles trace an arc (turn cap), not instant re-aim
 *
 * B. HAVOK SMOKE (real plugin, real scene): init physics, drop a dynamic
 *    ball onto the static court ground — it must land and rest, not fall
 *    through or explode. Proves the WASM boots headlessly and the ground
 *    aggregate works before any mode wires it in.
 *
 * Run: npx tsx scripts/court-movement-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + extra}`);
};

import { CourtMovement, DEFAULT_MOVEMENT } from '../lib/babylon/core/CourtMovement';

const DT = 1 / 60;

/** Simulate `seconds` of stick input, returning per-frame speed samples. */
function simulate(fn: (m: CourtMovement, frame: number, t: number) => [number, number, boolean], seconds: number) {
  const m = new CourtMovement();
  const speeds: number[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    const [x, y, s] = fn(m, i, i * DT);
    m.update(DT, x, y, s);
    speeds.push(m.vel.length());
  }
  return { m, speeds };
}

console.log('\nA. movement weight curves');
{
  // 1. Sprint ramp: cross 95% of top speed in 0.3–1.2s (arcade = 1 frame).
  const { speeds } = simulate(() => [0, 1, true], 2);
  const top = DEFAULT_MOVEMENT.maxSpeed;
  const t95 = speeds.findIndex((s) => s >= top * 0.95) * DT;
  ok(`sprint reaches 95% top speed in ${t95.toFixed(2)}s (0.3–1.2s window)`, t95 > 0.3 && t95 < 1.2);

  // 2. Stop from full sprint: 0.1–0.6s to <5% speed.
  let tStop = -1;
  const s2 = simulate((m, i, t) => (t < 1.5 ? [0, 1, true] : [0, 0, false]), 3);
  for (let i = Math.round(1.5 / DT); i < s2.speeds.length; i++) {
    if (s2.speeds[i] < top * 0.05) { tStop = i * DT - 1.5; break; }
  }
  ok(`full-sprint stop takes ${tStop.toFixed(2)}s (0.1–0.6s window)`, tStop > 0.1 && tStop < 0.6);

  // 3. Plant-and-cut at sprint: reversing the stick at top speed drops
  //    speed sharply before redirecting (momentum cost).
  const s3 = simulate((m, i, t) => (t < 1.5 ? [0, 1, true] : [0, -1, true]), 2.2);
  const minAfterCut = Math.min(...s3.speeds.slice(Math.round(1.5 / DT), Math.round(1.8 / DT)));
  ok(`hard cut at sprint bleeds to ${minAfterCut.toFixed(1)} m/s (<60% top)`, minAfterCut < top * 0.6);

  // 4. Same reversal from a jog keeps most of its (lower) speed.
  const jogTop = DEFAULT_MOVEMENT.maxSpeed * DEFAULT_MOVEMENT.jogFactor;
  const s4 = simulate((m, i, t) => (t < 1.5 ? [0, 1, false] : [0, -1, false]), 2.2);
  const minJogCut = Math.min(...s4.speeds.slice(Math.round(1.5 / DT), Math.round(1.8 / DT)));
  const kept = minJogCut / jogTop;
  ok(`jog cut keeps ${(kept * 100).toFixed(0)}% of jog speed (>55%)`, kept > 0.55);
  // and the sprint cut must cost MORE than the jog cut (relative to own top):
  ok('sprint cut is costlier than jog cut', minAfterCut / top < kept);

  // 5. Turn cap: sweeping the stick 90° at top speed doesn't snap.
  const m5 = new CourtMovement();
  for (let i = 0; i < Math.round(1.5 / DT); i++) m5.update(DT, 0, 1, true); // full sprint forward
  const before = Math.atan2(m5.vel.x, m5.vel.z);
  m5.update(DT, 1, 0, true); // hard right, one frame
  const turned = Math.abs(Math.atan2(m5.vel.x, m5.vel.z) - before);
  ok(`one frame of hard-right turns ${(turned * 180 / Math.PI).toFixed(1)}° (not 90°)`, turned < Math.PI / 4);
}

console.log('\nB. Havok smoke (real WASM, real scene)');
async function havokSmoke() {
  const B = await import('@babylonjs/core');
  const { initPhysics, __setHavokWasmBinary } = await import('../lib/babylon/core/Physics');
  __setHavokWasmBinary(fs.readFileSync(
    path.resolve(__dirname, '../node_modules/@babylonjs/havok/lib/umd/HavokPhysics.wasm'),
  ));
  const engine = new B.NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  new B.ArcRotateCamera('cam', 0, 0, 10, B.Vector3.Zero(), scene);
  const handle = await initPhysics(scene);
  ok('physics plugin enabled', !!handle.plugin && !!scene.getPhysicsEngine());

  const ball = B.MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  ball.position.set(0, 3, 0);
  const agg = new B.PhysicsAggregate(ball, B.PhysicsShapeType.SPHERE, { mass: 0.62, radius: 0.12, restitution: 0.6 }, scene);
  for (let i = 0; i < 240; i++) scene.render(); // 4 simulated seconds
  const y = ball.position.y;
  ok(`ball rests on the court (y=${y.toFixed(3)} ≈ radius)`, Math.abs(y - 0.12) < 0.08);
  agg.dispose();
  engine.dispose();
}

havokSmoke()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); })
  .catch((e) => { console.error('HAVOK SMOKE ERROR:', e); process.exit(2); });
