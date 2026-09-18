/**
 * scripts/surf-skin-tests.ts
 * ==========================
 * M9 Step 6 verification harness for the surf skin
 * (lib/feel/cores/surf-skin.ts + surf-constants.ts) on the shared Ride core.
 *
 * The surf mode is the ride archetype tuned wide + flowing, with the wave-lip
 * trim line as the "rail" (reference__SurfMode.js was
 * `class SurfMode extends SkateMode`). Proves the skin runs on the SAME core
 * AND that its wide/flowing identity is in effect:
 *   1. Full ollie phase walk on the shared core (Cruise→Setup→Air→Land).
 *   2. Surf carves wider than skate (greater lateral reach per second of steer).
 *   3. Surf is the widest run (laneHalfWidth beats skate and snowboard).
 *   4. Wave-lip trim lock-on — no teleport, scores, then flows back to air.
 *   5. A normal off-the-lip air lands cleanly (flowing re-entry, no bail).
 *   6. SensoryBus fires on ollie + landing.
 *
 * Run: yarn tsx scripts/surf-skin-tests.ts
 * Wired into scripts/standing-suite.ts as the 10th standing suite.
 */

import assert from 'node:assert';
import { type RidePhase } from '../lib/feel/cores/ride-core';
import { makeSurfRide, SURF_RAIL } from '../lib/feel/cores/surf-skin';
import { makeSkateRide } from '../lib/feel/cores/skate-skin';
import { makeSnowboardRide } from '../lib/feel/cores/snowboard-skin';
import { SensoryBus } from '../lib/feel';

const DT = 1 / 60;
const NEUTRAL = { steerX: 0, pumpY: 0 };

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Lateral distance travelled over 1s of full steer from spawn. */
function lateralReach(core: ReturnType<typeof makeSurfRide>): number {
  const x0 = core.state.pos.x;
  for (let i = 0; i < 60; i++) core.step(DT, { steerX: 1, pumpY: 0 });
  return core.state.pos.x - x0;
}

console.log('surf-skin-tests (surf skin on Ride core):');

check('runs the full ollie phase walk on the shared Ride core', () => {
  const core = makeSurfRide();
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

check('surf carves wider than skate (greater lateral reach)', () => {
  const surfReach = lateralReach(makeSurfRide());
  const skateReach = lateralReach(makeSkateRide() as any);
  assert.ok(surfReach > skateReach, `surf reach ${surfReach.toFixed(2)} should exceed skate ${skateReach.toFixed(2)}`);
});

check('surf is the widest run (laneHalfWidth beats skate + snowboard)', () => {
  const surf = makeSurfRide().t.laneHalfWidth;
  const skate = makeSkateRide().t.laneHalfWidth;
  const snow = makeSnowboardRide().t.laneHalfWidth;
  assert.ok(surf > skate && surf > snow, `surf lane ${surf} should exceed skate ${skate} and snow ${snow}`);
});

check('wave-lip trim lock-on: no teleport, scores, flows back to air', () => {
  const core = makeSurfRide();
  for (let i = 0; i < 500; i++) {
    const dx = SURF_RAIL.x - core.state.pos.x;
    core.step(DT, { steerX: Math.max(-1, Math.min(1, dx * 3)), pumpY: -0.3 });
    if (core.state.pos.z <= SURF_RAIL.zStart - 0.2) break;
  }
  core.ollie();
  for (let i = 0; i < 60; i++) { core.step(DT, NEUTRAL); if (core.state.phase === 'Air') break; }
  core.grind();
  let maxStep = 0;
  let prev = { ...core.state.pos };
  let trimSeen = false;
  let popped = false;
  for (let i = 0; i < 800; i++) {
    core.step(DT, NEUTRAL);
    const d = Math.hypot(core.state.pos.x - prev.x, core.state.pos.y - prev.y, core.state.pos.z - prev.z);
    maxStep = Math.max(maxStep, d);
    prev = { ...core.state.pos };
    if (core.state.grinding) trimSeen = true;
    if (trimSeen && !core.state.grinding) { popped = true; break; }
  }
  assert.ok(trimSeen, 'surfer should set on the trim line');
  assert.ok(maxStep < 0.6, `no teleport: max per-frame step ${maxStep.toFixed(3)}m`);
  assert.ok(core.state.score > 0, 'trimming should accumulate score');
  assert.ok(popped, 'surfer should flow back off the lip into the air');
});

check('a normal off-the-lip air lands cleanly (no bail)', () => {
  const core = makeSurfRide();
  core.ollie();
  let phase: RidePhase | null = null;
  for (let i = 0; i < 500; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') { phase = core.state.phase; break; }
  }
  assert.strictEqual(phase, 'Land', `a normal surf air should land, got ${phase}`);
});

check('SensoryBus fires on ollie and landing', () => {
  const bus = new SensoryBus();
  const fired: string[] = [];
  const core = makeSurfRide(bus, { onSensory: (evt) => fired.push(evt) });
  core.ollie();
  for (let i = 0; i < 500; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') break;
  }
  assert.ok(fired.includes('ollie'), 'ollie sensory should fire');
  assert.ok(fired.some((e) => e.startsWith('land') || e === 'bail'), 'a landing sensory should fire');
  assert.ok(bus.stats.emitted >= 2, `bus should have emitted at least twice, got ${bus.stats.emitted}`);
});

console.log(`\nsurf-skin-tests: ${passed} checks passed \u2713`);
