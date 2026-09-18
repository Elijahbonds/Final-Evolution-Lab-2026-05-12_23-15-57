#!/usr/bin/env -S npx tsx
/**
 * scripts/tennis-core-tests.ts — Mode 7 Phases 2+3 proof (headless).
 *   A. Positioning: set feet widen the window; stretching narrows it and
 *      caps the menu (a stretched late contact forces a slice).
 *   B. ONE timing input shapes power+placement+spin simultaneously —
 *      early/perfect/late produce genuinely different shots.
 *   C. Skill traces: better positioning + timing measurably improves
 *      outcomes (the depth is learnable, not dice).
 *
 * Run: npx tsx scripts/tennis-core-tests.ts
 */
import assert from 'node:assert';
import { positioningQuality, effectiveWindow, resolveShotTiming } from '../lib/babylon/core/TennisCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const SET = { distToContact: 0.2, speedAtContact: 0.4, splitStepped: true, recovered01: 1 };
const STRETCHED = { distToContact: 1.6, speedAtContact: 5.5, splitStepped: false, recovered01: 0.2 };

console.log('\nA. positioning shapes the window');
ok('set feet widen the window; stretched narrows it', () => {
  const qs = positioningQuality(SET), qx = positioningQuality(STRETCHED);
  assert.ok(qs > 0.8 && qx < 0.45, `${qs.toFixed(2)} vs ${qx.toFixed(2)}`);
  assert.ok(effectiveWindow(qs, 0.34) > effectiveWindow(qx, 0.34) * 1.8, 'window follows positioning');
});
ok('stretched + late forces a slice hack (menu constrains, not just a scalar)', () => {
  const r = resolveShotTiming(0.2, positioningQuality(STRETCHED), 'topspin');
  assert.equal(r.forcedType, 'slice', 'on-the-run late = a hack slice');
});

console.log('\nB. one input, three outputs');
ok('early / perfect / late differ in power AND placement AND spin', () => {
  const q = positioningQuality(SET);
  const early = resolveShotTiming(-0.16, q, 'topspin');
  const perfect = resolveShotTiming(0.01, q, 'topspin');
  const late = resolveShotTiming(0.16, q, 'topspin');
  assert.ok(perfect.power01 > early.power01 && early.power01 > late.power01, `power: ${perfect.power01}/${early.power01}/${late.power01}`);
  assert.ok(late.placementErr > perfect.placementErr && early.placementErr > perfect.placementErr, 'placement suffers both ways');
  assert.ok(Math.abs(perfect.spin) > Math.abs(late.spin), 'spin quality follows timing');
  assert.notEqual(early.outcome, perfect.outcome);
});

console.log('\nC. the depth is learnable (skill traces)');
ok('better positioning + timing measurably improves outcomes', () => {
  const goodSet = resolveShotTiming(0.01, positioningQuality(SET), 'topspin');
  const rushedLate = resolveShotTiming(0.2, positioningQuality(STRETCHED), 'topspin');
  assert.ok(goodSet.outcome === 'winner' || goodSet.outcome === 'aggressive');
  assert.ok(['defensive', 'dump'].includes(rushedLate.outcome), `stretched late = ${rushedLate.outcome}`);
  assert.ok(goodSet.power01 > rushedLate.power01 * 1.5);
});

console.log(`\n${pass} checks green`);
