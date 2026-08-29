/**
 * scripts/ride-core-tests.ts
 * ==========================
 * M9 Step 4 verification harness for the Ride/carve archetype core
 * (lib/feel/cores/ride-core.ts) skinned as the skateboard
 * (lib/feel/cores/skate-skin.ts + skate-constants.ts).
 *
 * Proves, by driving the headless core at a fixed 60Hz:
 *   1. Cruise: forward velocity carries the rider down-strip (z decreases).
 *   2. Pump accelerates, brake decelerates, both clamped to [minSpeed,maxSpeed].
 *   3. Ollie phase walk Cruise→Setup→Air→Land with a real apex, airborne
 *      toggling true then false on the shared variable-gravity curve.
 *   4. Trick taps add rotation; a completed spin still lands clean.
 *   5. Grind lock-on: near the rail + grind snaps on with NO teleport
 *      (no 16ms step displaces the body beyond a continuous bound), scores
 *      while sliding, then pops back into the air.
 *   6. Bail: a hard landing without a stick tap crashes → Bail phase, speed
 *      dropped to bailSpeed.
 *   7. Stuck: the same hard landing WITH a stick tap is saved → Land phase.
 *   8. Camera FOV stretches with speed (the ride archetype's identity).
 *   9. Endless strip wraps position without discontinuity in travel.
 *  10. SensoryBus fires on ollie + landing (emitted stat + onSensory hook).
 *
 * Run: yarn tsx scripts/ride-core-tests.ts
 * Wired into scripts/standing-suite.ts as the 8th standing suite.
 */

import assert from 'node:assert';
import { RideCore, type RidePhase, type RideSkin } from '../lib/feel/cores/ride-core';
import { makeSkateRide, makeSkateSkin, SKATE_RAIL } from '../lib/feel/cores/skate-skin';
import { SensoryBus } from '../lib/feel';

const DT = 1 / 60;
const NEUTRAL = { steerX: 0, pumpY: 0 };

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Run to the first airborne frame after an ollie, returning the core. */
function ollieToAir(core: RideCore, maxFrames = 60): void {
  core.ollie();
  for (let i = 0; i < maxFrames; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Air') return;
  }
  throw new Error('never reached Air after ollie');
}

console.log('ride-core-tests (skateboard skin on Ride core):');

check('cruise carries the rider forward (z decreases)', () => {
  const core = makeSkateRide();
  const z0 = core.state.pos.z;
  for (let i = 0; i < 60; i++) core.step(DT, NEUTRAL);
  assert.strictEqual(core.state.phase, 'Cruise');
  assert.ok(core.state.pos.z < z0 - 5, `expected forward travel, z ${z0}→${core.state.pos.z}`);
});

check('pump accelerates and brake decelerates within [min,max]', () => {
  const core = makeSkateRide();
  const cruise = core.state.speed;
  for (let i = 0; i < 120; i++) core.step(DT, { steerX: 0, pumpY: -1 });
  const pumped = core.state.speed;
  assert.ok(pumped > cruise, `pump should raise speed ${cruise}→${pumped}`);
  assert.ok(pumped <= core.t.maxSpeed + 1e-6, `speed clamped to max, got ${pumped}`);
  for (let i = 0; i < 300; i++) core.step(DT, { steerX: 0, pumpY: 1 });
  const braked = core.state.speed;
  assert.ok(braked < pumped, `brake should lower speed ${pumped}→${braked}`);
  assert.ok(braked >= core.t.minSpeed - 1e-6, `speed clamped to min, got ${braked}`);
});

check('ollie phase walk Cruise→Setup→Air→Land with a real apex', () => {
  const core = makeSkateRide();
  const seen: RidePhase[] = [core.state.phase];
  let last: RidePhase = core.state.phase;
  let apex = 0;
  let sawAirborne = false;
  core.ollie();
  for (let i = 0; i < 400; i++) {
    const s = core.step(DT, NEUTRAL);
    if (s.phase !== last) { seen.push(s.phase); last = s.phase; }
    apex = Math.max(apex, s.pos.y);
    if (s.airborne) sawAirborne = true;
    if (sawAirborne && !s.airborne && s.phase !== 'Air') break;
  }
  assert.deepStrictEqual(seen, ['Cruise', 'Setup', 'Air', 'Land'], `phase walk was ${seen.join('→')}`);
  assert.ok(apex > 1.0, `ollie apex should clear 1m, got ${apex.toFixed(3)}`);
  assert.ok(!core.state.airborne, 'should be grounded after landing');
});

check('a completed trick spin lands clean and scores a combo', () => {
  const core = makeSkateRide();
  ollieToAir(core);
  core.trick(); core.step(DT, NEUTRAL); core.trick(); // two taps = one full rotation
  let grade: string | null = null;
  for (let i = 0; i < 400; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') { grade = core.state.lastGrade; break; }
  }
  assert.ok(grade === 'clean' || grade === 'stuck', `completed spin should land clean/stuck, got ${grade}`);
  assert.ok(core.state.combo >= 1, 'combo should increment on a good landing');
});

check('grind lock-on snaps to the rail with NO teleport, scores, then pops', () => {
  const core = makeSkateRide();
  // Steer onto the rail line and roll just past the rail entry.
  for (let i = 0; i < 400; i++) {
    const dx = SKATE_RAIL.x - core.state.pos.x;
    core.step(DT, { steerX: Math.max(-1, Math.min(1, dx * 3)), pumpY: -0.3 });
    if (core.state.pos.z <= SKATE_RAIL.zStart - 0.2) break;
  }
  ollieToAir(core);
  core.grind();
  let maxStep = 0;
  let prev = { ...core.state.pos };
  let grindSeen = false;
  let popped = false;
  for (let i = 0; i < 600; i++) {
    core.step(DT, NEUTRAL);
    const d = Math.hypot(
      core.state.pos.x - prev.x,
      core.state.pos.y - prev.y,
      core.state.pos.z - prev.z,
    );
    maxStep = Math.max(maxStep, d);
    prev = { ...core.state.pos };
    if (core.state.grinding) grindSeen = true;
    if (grindSeen && !core.state.grinding) { popped = true; break; }
  }
  assert.ok(grindSeen, 'rider should engage a grind');
  assert.ok(maxStep < 0.5, `no teleport: max per-frame step ${maxStep.toFixed(3)}m`);
  assert.ok(core.state.score > 0, 'grinding should accumulate score');
  assert.ok(popped, 'rider should pop off the rail back into the air');
});

check('hard landing without a stick tap bails to Bail at bailSpeed', () => {
  const base = makeSkateSkin();
  const skin: RideSkin = { ...base, tuning: { ...base.tuning, ollieImpulse: 9.0, hardLandingVy: 4.0 } };
  const core = new RideCore(skin);
  core.ollie();
  let phase: RidePhase | null = null;
  for (let i = 0; i < 600; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Bail' || core.state.phase === 'Land') { phase = core.state.phase; break; }
  }
  assert.strictEqual(phase, 'Bail', `hard no-stick landing should bail, got ${phase}`);
  assert.strictEqual(core.state.lastGrade, 'crash', 'bail grade should be crash');
  assert.ok(Math.abs(core.state.speed - core.t.bailSpeed) < 1e-6, `speed should drop to bailSpeed, got ${core.state.speed}`);
});

check('the same hard landing WITH a stick tap is saved to Land', () => {
  const base = makeSkateSkin();
  const skin: RideSkin = { ...base, tuning: { ...base.tuning, ollieImpulse: 9.0, hardLandingVy: 4.0 } };
  const core = new RideCore(skin);
  core.ollie();
  let phase: RidePhase | null = null;
  for (let i = 0; i < 600; i++) {
    if (core.state.airborne && core.state.vy < 0 && core.state.pos.y < 0.3) core.stick();
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Bail' || core.state.phase === 'Land') { phase = core.state.phase; break; }
  }
  assert.strictEqual(phase, 'Land', `stuck landing should be saved, got ${phase}`);
  assert.strictEqual(core.state.lastGrade, 'stuck', 'grade should be stuck');
});

check('camera FOV stretches with speed', () => {
  const core = makeSkateRide();
  let maxStretch = 1;
  for (let i = 0; i < 180; i++) {
    core.step(DT, { steerX: 0, pumpY: -1 });
    maxStretch = Math.max(maxStretch, core.camera.fovStretch);
  }
  assert.ok(maxStretch > 1.02, `FOV should stretch at speed, got ${maxStretch.toFixed(3)}`);
});

check('endless strip wraps position without a travel discontinuity', () => {
  const core = makeSkateRide();
  const strip = core.t.stripLength;
  let wrapped = false;
  let maxStep = 0;
  let prevZ = core.state.pos.z;
  for (let i = 0; i < 5000; i++) {
    core.step(DT, { steerX: 0, pumpY: -1 });
    const dz = Math.abs(core.state.pos.z - prevZ);
    // On a wrap frame z jumps forward by exactly stripLength; ignore that.
    if (dz > strip - 1) { wrapped = true; } else { maxStep = Math.max(maxStep, dz); }
    prevZ = core.state.pos.z;
    if (wrapped && i > 100) break;
  }
  assert.ok(wrapped, 'strip should wrap over a long run');
  assert.ok(core.state.pos.z > -strip - 1e-6, 'position stays within one strip length');
  assert.ok(maxStep < 1.0, `per-frame travel bounded off wrap frames, got ${maxStep.toFixed(3)}`);
});

check('SensoryBus fires on ollie and landing', () => {
  const bus = new SensoryBus();
  const fired: string[] = [];
  const base = makeSkateSkin();
  const skin: RideSkin = { ...base, onSensory: (evt) => fired.push(evt) };
  const core = new RideCore(skin, bus);
  core.ollie();
  for (let i = 0; i < 400; i++) {
    core.step(DT, NEUTRAL);
    if (core.state.phase === 'Land' || core.state.phase === 'Bail') break;
  }
  assert.ok(fired.includes('ollie'), 'ollie sensory should fire');
  assert.ok(fired.some((e) => e.startsWith('land') || e === 'bail'), 'a landing sensory should fire');
  assert.ok(bus.stats.emitted >= 2, `bus should have emitted at least twice, got ${bus.stats.emitted}`);
});

console.log(`\nride-core-tests: ${passed} checks passed \u2713`);
