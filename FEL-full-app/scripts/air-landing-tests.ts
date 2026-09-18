#!/usr/bin/env -S npx tsx
/**
 * scripts/air-landing-tests.ts — Mode 3 Phases 5+6 proof (headless).
 *
 *   A. Air physics: spins persist with slight damping; stick nudges the
 *      axis; grabs accrue hold points and release cleanly; chained
 *      flip→grab→spin carries one rotation state.
 *   B. Landing truth: a completed 360 lands clean; a half-rotated spin
 *      bails; error is monotonic in residual rotation (never random).
 *   C. Sketchy window: mid-error lands sketchy; countering the wobble
 *      SAVES it; riding the wobble FAILS it.
 *
 * Run: npx tsx scripts/air-landing-tests.ts
 */

import assert from 'node:assert';
import { AirControl, GRAB_PTS_PER_SEC, type AirTrick } from '../lib/babylon/core/AirControl';
import { gradeLanding, resolveLanding, BalanceSave, CLEAN_MAX, SKETCHY_MAX } from '../lib/babylon/core/LandingSystem';
import { BalanceModel } from '../lib/babylon/core/BoardPhysics';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;
const FS360: AirTrick = { id: 'fs360', label: 'FS 360', family: 'spin', basePts: 140, difficulty: 3 };
const KICKFLIP: AirTrick = { id: 'kickflip', label: 'KICKFLIP', family: 'flip', basePts: 120, difficulty: 2 };
const INDY: AirTrick = { id: 'indy', label: 'INDY', family: 'grab', basePts: 90, difficulty: 1 };

console.log('\nA. air physics');
ok('spin persists with light damping; full 360 achievable in normal airtime', () => {
  const a = new AirControl();
  a.launch();
  a.applyTrick(FS360);
  const w0 = a.state.angularVel.y;
  for (let i = 0; i < 90; i++) a.update(DT);          // 1.5s air
  assert.ok(a.state.angularVel.y > w0 * 0.9, 'spin persists');
  const spunDeg = Math.abs(a.state.rotation.y) * 180 / Math.PI;
  assert.ok(spunDeg > 320, `rotated ${spunDeg.toFixed(0)}° in 1.5s`);
});
ok('grab holds accrue points; release banks them', () => {
  const a = new AirControl();
  a.launch();
  a.applyTrick(INDY);
  for (let i = 0; i < 60; i++) a.update(DT);          // 1s hold
  const pts = a.releaseGrab();
  assert.ok(Math.abs(pts - GRAB_PTS_PER_SEC) <= 2, `~${GRAB_PTS_PER_SEC}pts for a 1s hold (${pts})`);
});
ok('flip→grab→spin chains share one rotation state', () => {
  const a = new AirControl();
  a.launch();
  a.applyTrick(KICKFLIP);
  a.applyTrick(INDY);
  a.applyTrick(FS360);
  for (let i = 0; i < 45; i++) a.update(DT, 0.3, 0);  // steering mid-air
  assert.equal(a.state.chain.length, 2, 'flip + spin chained (grab is a state)');
  assert.equal(a.state.grabHeld, 'indy');
  assert.ok(a.state.angularVel.length() > 0);
});

console.log('\nB. landing truth (no dice)');
ok('a completed spin lands clean; a half spin bails; error is monotonic', () => {
  // completed 360: rotation.y ≈ 2π
  const clean = new AirControl(); clean.launch();
  clean.state.rotation.y = Math.PI * 2 * 0.98;
  const half = new AirControl(); half.launch();
  half.state.rotation.y = Math.PI;                    // upside-sideways
  const eClean = clean.landingError01();
  const eHalf = half.landingError01();
  assert.ok(eClean < CLEAN_MAX, `full rotation is clean (${eClean.toFixed(2)})`);
  assert.ok(eHalf > SKETCHY_MAX, `half rotation bails (${eHalf.toFixed(2)})`);
  // monotonic in residual rotation
  let prev = -1;
  for (const frac of [0, 0.1, 0.25, 0.4, 0.5]) {
    const a = new AirControl(); a.launch();
    a.state.rotation.y = Math.PI * 2 * frac;
    const e = a.landingError01();
    assert.ok(e > prev, `error grows with residue (${frac} → ${e.toFixed(2)})`);
    prev = e;
  }
});
ok('slope mismatch and speed add error (physics, not vibes)', () => {
  const flat = gradeLanding({ error01: 0.2, slopeMismatch01: 0, speed01: 0.3 });
  const steep = gradeLanding({ error01: 0.2, slopeMismatch01: 0.6, speed01: 0.9 });
  assert.equal(flat, 'clean');
  assert.notEqual(steep, 'clean');
});

console.log('\nC. sketchy save window');
ok('mid-error = sketchy; countering saves, riding the wobble fails', () => {
  const mk = () => {
    const air = new AirControl(); air.launch();
    air.state.rotation.y = Math.PI * 2 * 0.2;          // noticeably under-rotated
    const balance = new BalanceModel();
    const res = resolveLanding(air, balance, { error01: air.landingError01(), slopeMismatch01: 0.1, speed01: 0.5 });
    assert.equal(res.grade, 'sketchy');
    return res.save!;
  };
  // counter the wobble: feed stick against wobble.sign each frame
  const save = mk();
  for (let i = 0; i < 90 && save.active; i++) save.update(DT, -Math.sign(save.wobble) * 0.8);
  assert.ok(save.saved, 'countering saves the landing');
  // ride the wobble
  const fail = mk();
  for (let i = 0; i < 90 && fail.active; i++) fail.update(DT, Math.sign(fail.wobble) * 0.8);
  assert.ok(fail.failed, 'riding the wobble bails');
});

console.log(`\n${pass} checks green`);
