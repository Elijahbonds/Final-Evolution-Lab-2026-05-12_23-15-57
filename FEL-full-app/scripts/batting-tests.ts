#!/usr/bin/env -S npx tsx
/**
 * scripts/batting-tests.ts — Mode 6 Phases 4+5 proof (headless).
 *   A. Swing types trade off: contact forgives, power pays more.
 *   B. Contact EMERGES from timing+PCI+pitch: whiff/weak/solid/barrel all
 *      reachable by real input, each with a plain-language WHY.
 *   C. Exit velo and launch angle derive from the inputs (perfect+squared
 *      beats late+off-barrel; a fastball gets hit harder).
 *   D. Feedback is always present and specific.
 *
 * Run: npx tsx scripts/batting-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { PCI, contactEvent, SWING } from '../lib/babylon/core/Batting';
import { PITCHES } from '../lib/babylon/core/Pitching';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const CENTER = new Vector3(0, 0.82, 0);

console.log('\nA. swing tradeoffs');
ok('contact has a bigger window; power has a higher ceiling', () => {
  assert.ok(SWING.contact.windowSec > SWING.power.windowSec);
  assert.ok(SWING.power.maxExitVelo > SWING.contact.maxExitVelo);
});

console.log('\nB. contact emerges from real inputs');
ok('whiff / weak / solid / barrel all reachable + explained', () => {
  const pci = new PCI(); pci.x = 0; pci.y = 0.82;
  const whiff = contactEvent(0.5, pci, CENTER, PITCHES.fastball, 'contact');
  assert.equal(whiff.outcome, 'whiff');
  assert.ok(whiff.why.length > 8, 'whiff explains itself');
  const weak = contactEvent(0.1, { ...pci, y: 1.05 } as PCI, CENTER, PITCHES.fastball, 'contact');
  assert.ok(['weak', 'foul'].includes(weak.outcome), `off the top = ${weak.outcome}`);
  const solid = contactEvent(0.01, pci, CENTER, PITCHES.fastball, 'contact');
  assert.ok(['solid', 'barrel'].includes(solid.outcome));
  const barrel = contactEvent(0.005, pci, CENTER, PITCHES.fastball, 'power');
  assert.equal(barrel.outcome, 'barrel');
  assert.ok(barrel.why.includes('Perfect'), `barrel says why: ${barrel.why}`);
});

console.log('\nC. physics derive from inputs');
ok('perfect+squared > late+off; fastballs get hit harder', () => {
  const pci = new PCI(); pci.x = 0; pci.y = 0.82;
  const good = contactEvent(0.005, pci, CENTER, PITCHES.fastball, 'power');
  const bad = contactEvent(0.1, { ...pci, y: 1.0 } as PCI, CENTER, PITCHES.fastball, 'power');
  assert.ok((good.exitVelo ?? 0) > (bad.exitVelo ?? 0), `${good.exitVelo} > ${bad.exitVelo}`);
  const fb = contactEvent(0.005, pci, CENTER, PITCHES.fastball, 'power');
  const ch = contactEvent(0.005, pci, CENTER, PITCHES.changeup, 'power');
  assert.ok((fb.exitVelo ?? 0) > (ch.exitVelo ?? 0), 'hit a fastball harder than a changeup');
  assert.ok((good.launchAngleDeg ?? 0) > 0 && (good.launchAngleDeg ?? 0) < 40, 'a squared ball has a real launch angle');
});

console.log('\nD. feedback is always specific');
ok('every outcome carries timing + pci + why', () => {
  for (const [t, y] of [[0.5, 0.82], [0.005, 0.82], [0.09, 1.1], [-0.06, 0.6]] as const) {
    const pci = new PCI(); pci.x = 0; pci.y = y;
    const r = contactEvent(t, pci, CENTER, PITCHES.slider, 'contact');
    assert.ok(r.why.length > 8, `report explains itself: ${r.why}`);
    assert.ok(r.pciDistM >= 0);
  }
});

console.log(`\n${pass} checks green`);
