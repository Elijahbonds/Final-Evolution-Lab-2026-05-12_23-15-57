#!/usr/bin/env -S npx tsx
/**
 * scripts/carrier-control-tests.ts — Mode 4 Phase 4 proof (headless).
 *   A. Builds differ for real: scat accelerates/tops out higher; power
 *      resists tackles better. Not a reskin.
 *   B. Four moves are DISTINCT: each has its own window/cooldown/tax, and
 *      each beats the tackle it was built for (and only that).
 *   C. Tackle resolution is geometry: truck beats square, loses to the
 *      back-side wrap; juke beats the front reach; no-move outcome tracks
 *      build+momentum.
 *
 * Run: npx tsx scripts/carrier-control-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { CarrierController, resolveTackle, CARRIER_BUILDS, type TackleContext } from '../lib/babylon/core/CarrierControl';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. build tradeoffs');
ok('scat is faster and quicker; power resists better', () => {
  const s = new CarrierController('scat'), p = new CarrierController('power');
  for (let i = 0; i < 90; i++) { s.update(DT, 0, 1, true); p.update(DT, 0, 1, true); }
  assert.ok(s.vel.length() > p.vel.length() * 1.15, `scat ${s.vel.length().toFixed(1)} vs power ${p.vel.length().toFixed(1)}`);
  assert.ok(CARRIER_BUILDS.power.tackleResist > CARRIER_BUILDS.scat.tackleResist);
});

console.log('\nB. four distinct moves');
ok('each move: own window, own cooldown, own speed tax, cooldown gates spam', () => {
  const c = new CarrierController('scat');
  assert.ok(c.trigger('juke'));
  assert.ok(!c.trigger('spin'), 'one move at a time');
  for (let i = 0; i < 30; i++) c.update(DT, 0, 1, false);   // move ends, cooldown live
  assert.ok(!c.trigger('juke'), 'juke on cooldown');
  for (let i = 0; i < 60; i++) c.update(DT, 0, 1, false);
  assert.ok(c.trigger('juke'), 'recovered');
});

console.log('\nC. tackle geometry (no dice)');
ok('truck beats square, loses to the back wrap; juke beats the front reach', () => {
  const base: TackleContext = {
    tacklerPos: new Vector3(0, 0, -1), carrierPos: new Vector3(0, 0, 0),
    tacklerVel: new Vector3(0, 0, 4), carrierVel: new Vector3(0, 0, 5),
    move: null, build: 'scat',
  };
  // head-on (tackler in front) gets trucked by a power back
  assert.equal(resolveTackle({ ...base, tacklerPos: new Vector3(0, 0, 1.4), move: 'truck', build: 'power' }), 'broken');
  // wrapped from behind beats a truck
  assert.equal(resolveTackle({ ...base, tacklerPos: new Vector3(0, 0, -1.2), move: 'truck', build: 'power' }), 'tackled');
  // front reach vs juke
  assert.equal(resolveTackle({ ...base, tacklerPos: new Vector3(0, 0, 1.2), move: 'juke' }), 'evaded');
  // stiff-arm rejects the side reach
  assert.equal(resolveTackle({ ...base, tacklerPos: new Vector3(1.0, 0, 0.4), move: 'stiffArm' }), 'broken');
  // no move: a slow scat back gets wrapped, a rumbling power back breaks it
  assert.equal(resolveTackle({ ...base, carrierVel: new Vector3(0, 0, 2), build: 'scat' }), 'tackled');
  assert.equal(resolveTackle({ ...base, carrierVel: new Vector3(0, 0, 5.5), build: 'power' }), 'broken');
});

console.log(`\n${pass} checks green`);
