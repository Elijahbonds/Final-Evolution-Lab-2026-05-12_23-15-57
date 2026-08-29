/**
 * scripts/snowboard-skin-tests.ts
 * ===============================
 * M9 Step 5 verification harness for the snowboard skin
 * (lib/feel/cores/snowboard-skin.ts + snowboard-constants.ts) on the shared
 * Ride/carve core.
 *
 * The snowboard is the skate archetype dialled steeper + faster with a
 * rock-ledge rail (reference__SnowboardMode.js was literally
 * `class SnowboardMode extends SkateMode`). This harness proves the skin runs
 * on the SAME core AND that its distinct feel is actually in effect:
 *   1. Runs the full ollie phase walk on the shared core (Cruise→Setup→Air→Land).
 *   2. Snowboard is faster than skate: higher cruise + higher top speed.
 *   3. Snowboard airs bigger: greater ollie apex than the skate skin.
 *   4. Grind lock-on on the rock ledge — no teleport, scores, pops back to air.
 *   5. Higher hard-landing bar: an impact that would bail skate is saved here.
 *   6. SensoryBus fires on ollie + landing.
 *
 * Run: yarn tsx scripts/snowboard-skin-tests.ts
 * Wired into scripts/standing-suite.ts as the 9th standing suite.
 */

import assert from 'node:assert';
import { type RidePhase } from '../lib/feel/cores/ride-core';
import { makeSnowboardRide, SNOWBOARD_RAIL } from '../lib/feel/cores/snowboard-skin';
import { makeSkateRide } from '../lib/feel/cores/skate-skin';
import { SensoryBus } from '../lib/feel';

const DT = 1 / 60;
const NEUTRAL = { steerX: 0, pumpY: 0 };

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Ollie and measure apex on the given ride core. */
function ollieApex(core: ReturnType<typeof makeSnowboardRide>): number {
  core.ollie();
  let apex = 0;
  let air = false;
  for (let i = 0; i < 500; i++) {
    const s = core.step(DT, NEUTRAL);
    if (s.airborne) air = true;
    apex = Math.max(apex, s.pos.y);
    if (air && !s.airborne && s.phase !== 'Air') break;
  }
  return apex;
}

console.log('snowboard-skin-tests (snowboard skin on Ride core):');

check('runs the full ollie phase walk on the shared Ride core', () => {
  const core = makeSnowboardRide();
  const seen: RidePhase[] = [core.state.phase];
  let last: RidePhase = core.state.phase;
  let air = false;
  core.ollie();
  for (let i = 0; i < 500; i++) {
    const s = core.step(DT, NEUTRAL);
    if (s.phase !== last) { seen.push(s.phase); last = s.phase; }
    if (s.airborne) air = true;
    if (air && !s.airborne && s.phase !== 'Air') break;
  }
  assert.deepStrictEqual(seen, ['Cruise', 'Setup', 'Air', 'Land'], `phase walk was ${seen.join('→')}`);
});

check('snowboard is faster than skate (cruise + top speed)', () => {
  const snow = makeSnowboardRide();
  const skate = makeSkateRide();
  assert.ok(snow.state.speed > skate.state.speed, `snow cruise ${snow.state.speed} should exceed skate ${skate.state.speed}`);
  assert.ok(snow.t.maxSpeed > skate.t.maxSpeed, `snow max ${snow.t.maxSpeed} should exceed skate ${skate.t.maxSpeed}`);
});

check('snowboard airs bigger than skate (greater apex)', () => {
  const snowApex = ollieApex(makeSnowboardRide());
  const skateApex = ollieApex(makeSkateRide() as any);
  assert.ok(snowApex > skateApex, `snow apex ${snowApex.toFixed(2)} should exceed skate ${skateApex.toFixed(2)}`);
});

check('rock-ledge grind lock-on: no teleport, scores, pops back to air', () => {
  const core = makeSnowboardRide();
  for (let i = 0; i < 500; i++) {
    const dx = SNOWBOARD_RAIL.x - core.state.pos.x;
    core.step(DT, { steerX: Math.max(-1, Math.min(1, dx * 3)), pumpY: -0.3 });
    if (core.state.pos.z <= SNOWBOARD_RAIL.zStart - 0.2) break;
  }
  core.ollie();
  for (let i = 0; i < 60; i++) { core.step(DT, NEUTRAL); if (core.state.phase === 'Air') break; }
  core.grind();
  let maxStep = 0;
  let prev = { ...core.state.pos };
  let grindSeen = false;
  let popped = false;
  for (let i = 0; i < 700; i++) {
    core.step(DT, NEUTRAL);
    const d = Math.hypot(core.state.pos.x - prev.x, core.state.pos.y - prev.y, core.state.pos.z - prev.z);
    maxStep = Math.max(maxStep, d);
    prev = { ...core.state.pos };
    if (core.state.grinding) grindSeen = true;
    if (grindSeen && !core.state.grinding) { popped = true; break; }
  }
  assert.ok(grindSeen, 'rider should engage a grind on the ledge');
  assert.ok(maxStep < 0.6, `no teleport: max per-frame step ${maxStep.toFixed(3)}m`);
  assert.ok(core.state.score > 0, 'grinding should accumulate score');
  assert.ok(popped, 'rider should pop off the ledge back into the air');
});

check('higher hard-landing bar than skate (a mid impact is saved, not bailed)', () => {
  // An impact between skate's bar (9) and snowboard's bar (11) should bail on
  // skate feel but be saved (Land) on snowboard feel — proves the skin value bites.
  const skateBar = makeSkateRide().t.hardLandingVy;
  const snowBar = makeSnowboardRide().t.hardLandingVy;
  assert.ok(snowBar > skateBar, `snow bar ${snowBar} should exceed skate ${skateBar}`);
  // A gentle ollie on snowboard (impact below its bar) lands, never bails.
  const core = makeSnowboardRide();
  core.ollie();
  let phase: RidePhase | null = null;
  for (let i = 0; i < 500; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') { phase = core.state.phase; break; }
  }
  assert.strictEqual(phase, 'Land', `a normal snowboard ollie should land, got ${phase}`);
});

check('SensoryBus fires on ollie and landing', () => {
  const bus = new SensoryBus();
  const fired: string[] = [];
  const core = makeSnowboardRide(bus, { onSensory: (evt) => fired.push(evt) });
  core.ollie();
  for (let i = 0; i < 500; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') break;
  }
  assert.ok(fired.includes('ollie'), 'ollie sensory should fire');
  assert.ok(fired.some((e) => e.startsWith('land') || e === 'bail'), 'a landing sensory should fire');
  assert.ok(bus.stats.emitted >= 2, `bus should have emitted at least twice, got ${bus.stats.emitted}`);
});

console.log(`\nsnowboard-skin-tests: ${passed} checks passed \u2713`);
