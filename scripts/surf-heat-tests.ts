#!/usr/bin/env -S npx tsx
/**
 * scripts/surf-heat-tests.ts — Mode 3 Phase 16 proof (headless).
 *   A. Barrel: entry only in the breaking power section; exiting banks
 *      tube time; overstaying = wipeout (unbanked points die).
 *   B. Wave scores: selection + maneuvers + tube sum sensibly; a wipeout
 *      discounts the wave.
 *   C. Heat: best-N format (a blowout wave doesn't dilute a great one).
 *
 * Run: npx tsx scripts/surf-heat-tests.ts
 */
import assert from 'node:assert';
import { BarrelRide, scoreWave, HeatScore } from '../lib/babylon/core/SurfHeat';
import { WaveLifecycle } from '../lib/babylon/core/WaveSim';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. barrel');
ok('tube entry only in the power section; exit banks, overstay wipes', () => {
  const w = new WaveLifecycle(1, 1, 8, 2);
  const b = new BarrelRide();
  for (let i = 0; i < 2.2 / DT; i++) w.update(DT);   // into breaking
  assert.equal(w.phase, 'breaking');
  // rider at the peel front
  assert.ok(b.tryEnter(w, Math.max(0, w.peel01 - 0.05)), 'power section entry');
  // not in the flat ahead
  const b2 = new BarrelRide();
  assert.ok(!b2.tryEnter(w, Math.min(1, w.peel01 + 0.3)), 'no tube on the flat shoulder');
  // ride 1s then exit
  for (let i = 0; i < 60; i++) b.update(DT, false);
  const out = b.update(DT, true);
  assert.equal(out.state, 'exited');
  assert.ok(out.pts > 100, `tube time paid (${out.pts})`);
  // overstay = wipeout
  const b3 = new BarrelRide();
  b3.tryEnter(w, Math.max(0, w.peel01 - 0.05));
  let res = b3.update(DT, false);
  for (let i = 0; i < 300 && b3.inTube; i++) res = b3.update(DT, false);
  assert.equal(res.state, 'wipeout');
  assert.equal(res.pts, 0, 'overstaying burns the tube points');
});

console.log('\nB. wave scoring');
ok('selection + maneuvers + tube sum; wipeout discounts', () => {
  const clean = scoreWave({ selectionQuality01: 0.9, maneuvers: [{ label: 'CUTBACK', difficulty: 2 }, { label: 'AIR', difficulty: 4 }], tubeSec: 2, wipedOut: false });
  const wiped = scoreWave({ selectionQuality01: 0.9, maneuvers: [{ label: 'CUTBACK', difficulty: 2 }, { label: 'AIR', difficulty: 4 }], tubeSec: 2, wipedOut: true });
  const flat = scoreWave({ selectionQuality01: 0.2, maneuvers: [], tubeSec: 0, wipedOut: false });
  assert.ok(clean > flat * 3, `a real wave beats a bad wave (${clean} vs ${flat})`);
  assert.ok(wiped < clean * 0.5, 'wipeout discounts');
});

console.log('\nC. heat format');
ok('best-N: a blowout wave never dilutes the keepers', () => {
  const h = new HeatScore(2);
  h.addWave(8.5); h.addWave(2.0); h.addWave(7.4); h.addWave(1.2);
  assert.equal(h.total, 15.9, 'top-2 only');
  assert.equal(h.waveCount, 4);
});

console.log(`\n${pass} checks green`);
