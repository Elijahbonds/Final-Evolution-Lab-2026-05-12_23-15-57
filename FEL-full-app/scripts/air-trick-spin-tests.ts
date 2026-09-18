#!/usr/bin/env -S yarn tsx
/**
 * scripts/air-trick-spin-tests.ts
 * ===============================
 * AirTrick's two spin models (owner decision 2026-09-07):
 *   1. Discrete (the vault): a tap adds perTapRotation; the error to the nearest half turn is always 0, so a landing is
 *      stuck or clean — unchanged by the time-based option (spinRatePerSec unset).
 *   2. Time-based (big air): a tap STARTS the spin, update(dt) accumulates it, the next tap PLANTS it; you land wherever
 *      the rotation is — planted near a half turn = clean / stuck, off by up to 0.25 = sketchy, further = crash, and a
 *      spin still running at touchdown is judged where it stopped.
 *   3. Through the shared core: BIG_AIR_TRICK is time-based, the vault skin is not; a big-air spin left running lands
 *      sketchy or crash at least once over a sweep of plant times (the grade the discrete model could never produce).
 */

import assert from 'node:assert';
import { AirTrick } from '../lib/feel/air-trick';
import { makeBigAirSession, BIG_AIR_TRICK } from '../lib/feel/cores/big-air-skin';
import { makeVaultSession } from '../lib/feel/cores/vault-skin';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }
const DT = 1 / 60;

check('discrete mode: taps add half turns, update() is a no-op, the error is always 0', () => {
  let t = 0; const at = new AirTrick({ perTapRotation: 0.5, now: () => t });
  at.trick(); at.trick(); at.trick();
  at.update(1.0);
  assert.strictEqual(at.rotation, 1.5);
  assert.strictEqual(at.spinning, false);
  assert.strictEqual(at.land().grade, 'clean');
});

check('time-based: a tap starts the spin, update accumulates at spinRatePerSec, the next tap plants it', () => {
  let t = 0; const at = new AirTrick({ spinRatePerSec: 1.2, cleanTolerance: 0.15, now: () => t });
  at.trick(); assert.strictEqual(at.spinning, true);
  for (let i = 0; i < 50; i++) at.update(DT);      // 0.833 s → 1.0 turn
  assert.ok(Math.abs(at.rotation - 1.0) < 0.02, `rotation ${at.rotation}`);
  at.trick(); assert.strictEqual(at.spinning, false);
  at.update(1.0);
  assert.ok(Math.abs(at.rotation - 1.0) < 0.02, 'planted: no more rotation');
  const r = at.land();
  assert.strictEqual(r.grade, 'clean'); assert.ok(Math.abs(r.rotations - 1.0) < 0.02);
});

check('time-based: stick inside the window upgrades a clean plant to STUCK; backside direction is honoured', () => {
  let t = 0; const at = new AirTrick({ spinRatePerSec: 1.2, cleanTolerance: 0.15, stickWindowMs: 220, now: () => t });
  at.setDir(-1); at.trick();
  for (let i = 0; i < 25; i++) at.update(DT);      // ≈ −0.5 turn
  at.trick(); t = 1000; at.stick(); t = 1100;
  const r = at.land();
  assert.strictEqual(r.grade, 'stuck'); assert.ok(r.rotations < 0, 'backside spins negative');
});

check('time-based: an over-rotated plant is sketchy, a spin left running at touchdown can crash', () => {
  let t = 0;
  const sk = new AirTrick({ spinRatePerSec: 1.2, cleanTolerance: 0.15, now: () => t });
  sk.trick(); for (let i = 0; i < 60; i++) sk.update(DT);   // 1.2 turns → 0.2 off the half turn
  sk.trick();
  assert.strictEqual(sk.land().grade, 'sketchy');
  // a spin still RUNNING at touchdown and off the half turn is a crash (you never planted)
  const cr = new AirTrick({ spinRatePerSec: 1.2, cleanTolerance: 0.15, now: () => t });
  cr.trick(); for (let i = 0; i < 60; i++) cr.update(DT);   // 1.2 turns, still spinning
  const r = cr.land();
  assert.strictEqual(r.grade, 'crash');
  assert.strictEqual(cr.spinning, false, 'landing resets the spin');
  // a running spin that happens to be ON the half turn is clean — the judge reads the rotation, not the tap count
  const lucky = new AirTrick({ spinRatePerSec: 1.2, cleanTolerance: 0.15, now: () => t });
  lucky.trick(); for (let i = 0; i < 50; i++) lucky.update(DT);   // 1.0 turn, still spinning
  assert.strictEqual(lucky.land().grade, 'clean');
  // the error to the nearest half turn is at most 0.25: a PLANTED spin can never crash
  const c2 = new AirTrick({ spinRatePerSec: 1.0, cleanTolerance: 0.15, now: () => t });
  c2.trick(); for (let i = 0; i < 45; i++) c2.update(DT); c2.trick();   // 0.75 → err 0.25 → sketchy
  assert.strictEqual(c2.land().grade, 'sketchy');
});

check('through the core: big air is time-based, the vault stays discrete', () => {
  assert.ok((BIG_AIR_TRICK.spinRatePerSec ?? 0) > 0, 'BIG_AIR_TRICK sets spinRatePerSec');
  const vault = makeVaultSession();
  assert.strictEqual(vault.airTrick.spinRatePerSec, 0, 'vault skin has no time-based spin');
  const grades = new Set<string>();
  // sweep the plant time: 0.3 … 1.5 s after launch; every grade the judge knows must be reachable across the sweep
  for (let plantMs = 300; plantMs <= 1500; plantMs += 100) {
    const c = makeBigAirSession();
    let n = 0; while (c.state.phase === 'Run' && n++ < 6000) c.step(DT);
    assert.strictEqual(c.state.phase, 'Air');
    c.trick();
    let air = 0; let planted = false;
    n = 0; while (c.state.phase === 'Air' && n++ < 6000) { c.step(DT); air += DT * 1000; if (!planted && air >= plantMs) { c.trick(); planted = true; } }
    grades.add(c.state.lastGrade as string);
  }
  assert.ok(grades.has('sketchy'), `a mistimed plant lands sketchy (saw ${[...grades].join(', ')})`);
  assert.ok(grades.has('clean'), `a well-timed plant lands clean (saw ${[...grades].join(', ')})`);
  // and a spin never planted lands crash unless it happens to be on the half turn: sweep the start time instead
  const unplanted = new Set<string>();
  for (let startMs = 100; startMs <= 700; startMs += 100) {
    const c = makeBigAirSession();
    let n = 0; while (c.state.phase === 'Run' && n++ < 6000) c.step(DT);
    let air = 0; let started = false;
    n = 0; while (c.state.phase === 'Air' && n++ < 6000) { c.step(DT); air += DT * 1000; if (!started && air >= startMs) { c.trick(); started = true; } }
    unplanted.add(c.state.lastGrade as string);
  }
  assert.ok(unplanted.has('crash'), `an unplanted spin crashes (saw ${[...unplanted].join(', ')})`);
});

console.log(`\nair-trick-spin-tests: ${passed} checks green`);
