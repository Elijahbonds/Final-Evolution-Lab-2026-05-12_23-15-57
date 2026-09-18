#!/usr/bin/env -S npx tsx
/**
 * scripts/golf-core-tests.ts — Golf Phase 1 proof (headless).
 *   A. Three stages all matter: full-power+perfect tempo > weak power;
 *      bad tempo costs distance AND adds dispersion.
 *   B. Shape emerges from tempo: early tempo draws, late fades, wild tempo
 *      hooks/slices, clean tempo is straight.
 *   C. Clubs differ: driver out-carries the wedge by 2x+; putter barely
 *      flies and rolls. Lies tax contact (sand worst).
 *   D. Never pressing impact = the flub (resolves, low quality).
 *
 * Run: npx tsx scripts/golf-core-tests.ts
 */
import assert from 'node:assert';
import { ThreeClickSwing, resolveShot, BAG, LIE_CONTACT } from '../lib/babylon/core/GolfCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

/** Drive the meter to a target power then impact at a target downswing time. */
function swingAt(powerTarget: number, impactAtSec: number) {
  const s = new ThreeClickSwing();
  s.begin();
  // ride the backswing meter until it crosses the target going up
  let t = 0;
  let last = 0;
  while (t < 3) {
    s.update(DT);
    const v = (s as any).power.value as number;
    if (v >= powerTarget && last < v) { s.clickPower(DT); break; }
    last = v; t += DT;
  }
  // downswing: impact at the target time
  let r = null;
  while (!r) {
    r = s.update(DT);
    if ((s as any).downT >= impactAtSec && (s as any).stage === 'downswing') r = s.clickImpact(DT);
    if ((s as any).stage === 'done' && !r) r = (s as any).resolve?.(0);
  }
  return r!;
}

console.log('\nA. all three stages matter');
ok('full power + good tempo outdrives weak power or bad tempo', () => {
  const good = swingAt(0.9, 0.5);
  const weak = swingAt(0.3, 0.5);
  const rushed = swingAt(0.9, 0.12);
  assert.ok(good.distanceScale > weak.distanceScale, 'power matters');
  assert.ok(good.distanceScale > rushed.distanceScale, 'tempo matters');
  assert.ok(good.dispersionRad < rushed.dispersionRad, 'tempo controls dispersion');
});

console.log('\nB. shape from tempo');
ok('early tempo draws, late fades, clean is straight', () => {
  assert.equal(swingAt(0.8, 0.35).shape, 'draw');
  assert.equal(swingAt(0.8, 0.6).shape, 'fade');
  assert.equal(swingAt(0.8, 0.5).shape, 'straight');
});

console.log('\nC. bag + lies');
ok('driver >> wedge >> putter; sand costs the most', () => {
  const r = swingAt(0.85, 0.5);
  const d = resolveShot(r, BAG[0], 'tee');
  const w = resolveShot(r, BAG[3], 'fairway');
  const p = resolveShot(r, BAG[4], 'green');
  assert.ok(d.carryM > w.carryM * 2, `driver ${d.carryM.toFixed(0)}m vs wedge ${w.carryM.toFixed(0)}m`);
  assert.ok(p.carryM < 12 && p.rollM > p.carryM, 'putter rolls, barely flies');
  const sand = resolveShot(r, BAG[3], 'sand');
  assert.ok(sand.carryM < w.carryM, `sand costs (${sand.carryM.toFixed(0)} vs ${w.carryM.toFixed(0)})`);
  assert.ok(LIE_CONTACT.sand < LIE_CONTACT.fairway);
});

console.log('\nD. the flub');
ok('never clicking impact resolves as a poor shot, not a hang', () => {
  const s = new ThreeClickSwing();
  s.begin();
  let r = null;
  for (let i = 0; i < 120 && !r; i++) {
    s.update(DT);
    if ((s as any).power.value > 0.8) s.clickPower(DT);
    r = s.update(DT);
  }
  assert.ok(r, 'resolved');
  assert.ok(r.distanceScale < 0.6, `flubbed (${r.distanceScale.toFixed(2)})`);
});

console.log(`\n${pass} checks green`);
