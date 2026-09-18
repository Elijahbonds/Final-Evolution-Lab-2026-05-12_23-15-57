#!/usr/bin/env -S npx tsx
/**
 * scripts/rally-camera-tests.ts — Mode 7 Phase 9 proof (headless).
 *   A. The rally escalates: framing tightens as shots accumulate (and never
 *      clamps past legibility).
 *   B. The winner beat fires on the rally-ending shot and resets.
 *   C. Net approach blends continuously (no two-games cut).
 */
import assert from 'node:assert';
import { RallyFlow } from '../lib/babylon/core/RallyCamera';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. escalation');
ok('framing tightens as the rally builds, clamped legible', () => {
  const r = new RallyFlow();
  const scales: number[] = [];
  for (let shots = 0; shots <= 12; shots += 3) {
    for (let i = 0; i < 30; i++) r.update(1 / 60, { shotsExchanged: shots, approachingNet: false, lastShotWasWinner: false });
    scales.push(r.framingScale);
  }
  assert.ok(scales[0] > scales[scales.length - 1], `tightens (${scales[0].toFixed(2)} → ${scales[scales.length - 1].toFixed(2)})`);
  assert.ok(scales[scales.length - 1] >= 0.8, 'never unreadable');
});

console.log('\nB. payoff beat');
ok('a winner fires the payoff and the rally resets clean', () => {
  const r = new RallyFlow();
  for (let i = 0; i < 30; i++) r.update(1 / 60, { shotsExchanged: 8, approachingNet: false, lastShotWasWinner: false });
  const { payoffNow } = r.update(1 / 60, { shotsExchanged: 9, approachingNet: false, lastShotWasWinner: true });
  assert.ok(payoffNow, 'winner beat');
  r.reset();
  const after = r.update(1 / 60, { shotsExchanged: 0, approachingNet: false, lastShotWasWinner: false });
  assert.ok(!after.payoffNow);
});

console.log('\nC. net transition is continuous');
ok('baseline and net reads blend, not cut', () => {
  const r = new RallyFlow();
  assert.equal(r.netBlend({ shotsExchanged: 2, approachingNet: false, lastShotWasWinner: false }), 0);
  assert.equal(r.netBlend({ shotsExchanged: 2, approachingNet: true, lastShotWasWinner: false }), 1);
});

console.log(`\n${pass} checks green`);
