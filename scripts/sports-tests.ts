#!/usr/bin/env -S yarn tsx
/**
 * scripts/sports-tests.ts — M14-P10 Mode Rebuilds suite (baseball / golf / skate).
 * ============================================================================
 * Phase 10 rebuilds the flat 2D baseball & golf games onto real 3D scenes and
 * expands the skatepark into 3 readable zones with natural carve/pump
 * momentum. All the *rules* (contact timing, batted-ball distance & Movie
 * Event, golf shot scoring, skate zone layout + pump gain) live in PURE cores
 * so this suite verifies them headlessly and the 3D scenes stay thin skins.
 *
 *   A. BASEBALL CONTACT: perfect timing barrels the ball / clears the fence;
 *      early swing pulls, late pushes; whiff = miss; deterministic; the Movie
 *      Event category tracks the contact quality.
 *   B. GOLF SHOTS: dead-centre aim+power lands a birdie; wind must be
 *      compensated; power verdict tracks the bar; putts are forgiving.
 *   C. SKATE ZONES: 3 zones classify by position; the bowl dips below grade,
 *      the vert wall rises above it; perimeter keeps the rider in bounds; the
 *      terrain is continuous (no gradient spikes); pump only pays out on a
 *      carved transition and is capped.
 *   D. LIVE WIRING: the 3D scenes consume the cores; board physics uses the
 *      zones core; every core is import-pure (no three / react / DOM).
 *
 * Run: yarn tsx scripts/sports-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  resolveContact, battedBallEvent, PLATE_T, HR_DISTANCE_M,
  resolveShot, evaluateBar, GOLF_POWER_SWEET,
} from '@/lib/sports/swing-core';
import {
  zoneAt, skateHeight, pumpImpulse, SKATE_ZONES, PUMP_MAX_IMPULSE,
} from '@/lib/board/zones';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// ── A. BASEBALL CONTACT ──────────────────────────────────────────
console.log('\nA. baseball contact');

check('dead-centre timing barrels the ball and clears the fence (home run)', () => {
  const r = resolveContact(PLATE_T, 'fastball', 0);
  assert.equal(r.quality, 'perfect');
  assert.ok(r.distanceM >= HR_DISTANCE_M, `distance ${r.distanceM} should clear ${HR_DISTANCE_M}`);
  assert.equal(r.isHomeRun, true);
  assert.equal(r.category, 'homer');
});

check('a whiff (way off) is a miss with zero distance', () => {
  const r = resolveContact(PLATE_T - 0.4, 'curveball', 0);
  assert.equal(r.quality, 'whiff');
  assert.equal(r.distanceM, 0);
  assert.equal(r.category, 'miss');
});

check('an early swing pulls the ball (negative spray), a late swing pushes it', () => {
  const early = resolveContact(PLATE_T - 0.07, 'fastball', 0); // solid, early
  const late = resolveContact(PLATE_T + 0.07, 'fastball', 0); // solid, late
  assert.ok(early.sprayDeg < 0, `early spray ${early.sprayDeg} should be < 0`);
  assert.ok(late.sprayDeg > 0, `late spray ${late.sprayDeg} should be > 0`);
});

check('weak (clipped) contact is a pop, not a home run', () => {
  const r = resolveContact(PLATE_T + 0.13, 'changeup', 0);
  assert.equal(r.quality, 'clipped');
  assert.equal(r.isHomeRun, false);
  assert.equal(r.category, 'pop');
});

check('contact is deterministic (same swing -> same distance)', () => {
  const a = resolveContact(PLATE_T + 0.02, 'fastball', 0.3);
  const b = resolveContact(PLATE_T + 0.02, 'fastball', 0.3);
  assert.deepEqual(a, b);
});

check('the Movie Event category equals the contact category', () => {
  const r = resolveContact(PLATE_T, 'fastball', 0);
  assert.equal(battedBallEvent(r), r.category);
});

check('grade hang-bonus adds carry on good contact', () => {
  const plain = resolveContact(PLATE_T + 0.05, 'fastball', 0);
  const boosted = resolveContact(PLATE_T + 0.05, 'fastball', 0.5);
  assert.ok(boosted.distanceM > plain.distanceM);
});

// ── B. GOLF SHOTS ────────────────────────────────────────────
console.log('\nB. golf shots');

check('dead-centre aim + sweet-spot power with no wind is a birdie', () => {
  const r = resolveShot('drive', 0, GOLF_POWER_SWEET, 0);
  assert.equal(r.grade, 'birdie');
  assert.equal(r.points, 100);
  assert.equal(r.power, 'perfect');
});

check('ignoring the wind pushes the ball off the pin (worse grade)', () => {
  const compensated = resolveShot('drive', 0.5 * 0.6, GOLF_POWER_SWEET, 0.6); // aim = wind*0.5
  const ignored = resolveShot('drive', 0, GOLF_POWER_SWEET, 0.6); // aimed straight into wind
  assert.ok(ignored.distFromPinM > compensated.distFromPinM);
});

check('over-hitting the power bar reads as late', () => {
  const r = resolveShot('drive', 0, 0.95, 0);
  assert.equal(r.power, 'late');
});

check('putts are far more forgiving than drives for the same error', () => {
  const drive = resolveShot('drive', 0.3, GOLF_POWER_SWEET, 0);
  const putt = resolveShot('putt', 0.3, GOLF_POWER_SWEET, 0);
  assert.ok(putt.distFromPinM < drive.distFromPinM);
});

check('carry scales with power and stays within the club nominal', () => {
  const half = resolveShot('drive', 0, 0.5, 0);
  const full = resolveShot('drive', 0, 1.0, 0);
  assert.ok(full.carryM > half.carryM);
  assert.ok(full.carryM <= 210);
});

check('evaluateBar bands: inside=perfect, mid=good, far below=early, far above=late', () => {
  assert.equal(evaluateBar(0.72, 0.72, 0.05, 0.12), 'perfect');
  assert.equal(evaluateBar(0.62, 0.72, 0.05, 0.12), 'good');
  assert.equal(evaluateBar(0.40, 0.72, 0.05, 0.12), 'early');
  assert.equal(evaluateBar(0.95, 0.72, 0.05, 0.12), 'late');
});

// ── C. SKATE ZONES ─────────────────────────────────────────
console.log('\nC. skate zones');

check('each zone centre classifies to its own zone', () => {
  assert.equal(zoneAt(SKATE_ZONES.bowl.centerX, SKATE_ZONES.bowl.centerZ), 'bowl');
  assert.equal(zoneAt(SKATE_ZONES.flow.centerX, SKATE_ZONES.flow.centerZ), 'flow');
  assert.equal(zoneAt(SKATE_ZONES.vert.centerX, SKATE_ZONES.vert.centerZ), 'vert');
});

check('the bowl centre dips BELOW grade and the vert wall rises ABOVE it', () => {
  const bowlH = skateHeight(SKATE_ZONES.bowl.centerX, SKATE_ZONES.bowl.centerZ);
  const flowH = skateHeight(SKATE_ZONES.flow.centerX + 3, SKATE_ZONES.flow.centerZ);
  const vertH = skateHeight(11.5, SKATE_ZONES.vert.centerZ);
  assert.ok(bowlH < -1, `bowl centre ${bowlH.toFixed(2)} should be well below 0`);
  assert.ok(vertH > flowH + 1, `vert ${vertH.toFixed(2)} should tower over flow ${flowH.toFixed(2)}`);
});

check('the perimeter walls rise steeply to keep a rider in bounds', () => {
  assert.ok(skateHeight(13.5, 0) > 3, 'x past +13 should be a high wall');
  assert.ok(skateHeight(0, 16) > 0.2, 'z past +15 should ramp up');
});

check('the terrain is continuous (no gradient spikes across the park)', () => {
  const EPS = 0.25;
  let maxSlope = 0;
  for (let x = -12; x <= 12; x += 1) {
    for (let z = -12; z <= 12; z += 1) {
      const h = skateHeight(x, z);
      const gx = Math.abs(skateHeight(x + EPS, z) - h) / EPS;
      const gz = Math.abs(skateHeight(x, z + EPS) - h) / EPS;
      maxSlope = Math.max(maxSlope, gx, gz);
    }
  }
  // A quarterpipe wall is steep but must stay finite & sane (no NaN/inf spike).
  assert.ok(Number.isFinite(maxSlope) && maxSlope < 40, `max slope ${maxSlope} out of range`);
});

check('pump pays out ONLY on a carved transition, and is capped', () => {
  const flat = pumpImpulse('bowl', 0.05, 1, 1 / 60); // no slope -> no pump
  const noCarve = pumpImpulse('bowl', 1.0, 0, 1 / 60); // not carving -> no pump
  const good = pumpImpulse('bowl', 1.0, 1, 1 / 60); // steep + carving -> pump
  assert.equal(flat, 0);
  assert.equal(noCarve, 0);
  assert.ok(good > 0);
  const huge = pumpImpulse('vert', 50, 1, 1); // absurd inputs stay capped
  assert.ok(huge <= PUMP_MAX_IMPULSE + 1e-9, `pump ${huge} exceeds cap ${PUMP_MAX_IMPULSE}`);
});

check('the vert wall returns more pump than the flow street for the same carve', () => {
  const vert = pumpImpulse('vert', 1.0, 1, 1 / 60);
  const flow = pumpImpulse('flow', 1.0, 1, 1 / 60);
  assert.ok(vert > flow);
});

// ── D. LIVE WIRING ─────────────────────────────────────────
console.log('\nD. live wiring');

check('baseball-3d scene consumes the swing core', () => {
  const src = read('components/games/baseball-3d.tsx');
  assert.ok(/from '@\/lib\/sports\/swing-core'/.test(src));
  assert.ok(/resolveContact/.test(src));
});

check('golf-3d scene consumes the swing core', () => {
  const src = read('components/games/golf-3d.tsx');
  assert.ok(/from '@\/lib\/sports\/swing-core'/.test(src));
  assert.ok(/resolveShot/.test(src));
});

check('board physics uses the zones core for skate terrain + pump', () => {
  const src = read('lib/board/board-physics.ts');
  assert.ok(/from '\.\/zones'/.test(src));
  assert.ok(/skateHeight/.test(src) && /pumpImpulse/.test(src));
});

check('the loaders gate baseball/golf on is3D (3D when on, 2D fallback otherwise)', () => {
  const bb = read('app/play/baseball/_components/loader.tsx');
  const gf = read('app/play/golf/_components/loader.tsx');
  assert.ok(/is3D\('baseball'\)/.test(bb));
  assert.ok(/is3D\('golf'\)/.test(gf));
});

check('the sports + zones cores are import-pure (no three / react / DOM)', () => {
  for (const p of ['lib/sports/swing-core.ts', 'lib/board/zones.ts']) {
    const src = read(p);
    assert.ok(!/from 'three'/.test(src), `${p} must not import three`);
    assert.ok(!/from 'react'/.test(src), `${p} must not import react`);
    assert.ok(!/document\.|window\./.test(src), `${p} must not touch the DOM`);
  }
});

console.log(`\n\u2713 sports-tests: ${passed} checks passed`);
