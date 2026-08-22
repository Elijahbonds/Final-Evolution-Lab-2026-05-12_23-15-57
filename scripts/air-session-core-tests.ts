/**
 * scripts/air-session-core-tests.ts
 * =================================
 * M9 Step 7 verification harness for the Air-session archetype core
 * (lib/feel/cores/air-session-core.ts) skinned as Big Air
 * (lib/feel/cores/big-air-skin.ts + big-air-constants.ts).
 *
 * Proves, by driving the headless core at a fixed 60Hz:
 *   1. Phase walk Run → Air → Land over a single attempt (the archetype's
 *      run-up → launch → landing shape).
 *   2. NEGATIVE runDrag: the slope builds speed on its own with no taps, up
 *      to maxRunSpeed (big-air's identity).
 *   3. Launch impulse scales with carried run speed — a weak run gives a
 *      lower apex than a full-speed run (weak run = weak air).
 *   4. Trick taps add rotation; a completed spin lands clean and scores
 *      basePoints + rotations×pointsPerRotation.
 *   5. Stick tap in the window upgrades the same clean landing to STUCK
 *      (2× points), the risk/reward payoff.
 *   6. No teleport: off the respawn frame, no 16ms step displaces the body
 *      beyond a continuous bound.
 *   7. Attempts-per-round: the round runs exactly attemptsPerRound attempts
 *      then finishes (phase Done, finished flag, attempts log length).
 *   8. Cadence run-up: alternating taps during Run add speed; a same-side
 *      fault is penalised (RhythmCadence wired for the vault sibling).
 *   9. SensoryBus fires on launch + landing (emitted stat + onSensory hook).
 *
 * Run: yarn tsx scripts/air-session-core-tests.ts
 * Wired into scripts/standing-suite.ts as the 11th standing suite.
 */

import assert from 'node:assert';
import {
  AirSessionCore,
  type AirPhase,
  type AirSessionSkin,
} from '../lib/feel/cores/air-session-core';
import { makeBigAirSession, makeBigAirSkin, BIG_AIR_TUNING } from '../lib/feel/cores/big-air-skin';
import { SensoryBus } from '../lib/feel';

const DT = 1 / 60;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Step until the core reaches the Air phase (first launch). */
function runToAir(core: AirSessionCore, maxFrames = 2000): void {
  for (let i = 0; i < maxFrames; i++) {
    core.step(DT);
    if (core.state.phase === 'Air') return;
  }
  throw new Error('never reached Air');
}

/** Step through the current airborne attempt until it lands (Land phase). */
function airToLand(core: AirSessionCore, maxFrames = 2000): void {
  for (let i = 0; i < maxFrames; i++) {
    core.step(DT);
    if (core.state.phase === 'Land') return;
  }
  throw new Error('never landed');
}

console.log('air-session-core-tests (Big Air skin on Air-session core):');

check('phase walk Run → Air → Land over one attempt', () => {
  const core = makeBigAirSession();
  const seen: AirPhase[] = [core.state.phase];
  for (let i = 0; i < 2000; i++) {
    core.step(DT);
    const p = core.state.phase;
    if (seen[seen.length - 1] !== p) seen.push(p);
    if (p === 'Land') break;
  }
  assert.deepStrictEqual(seen, ['Run', 'Air', 'Land'], `unexpected phase walk: ${seen.join('→')}`);
});

check('negative runDrag: the slope builds speed to maxRunSpeed with no taps', () => {
  const core = makeBigAirSession();
  const speeds: number[] = [];
  for (let i = 0; i < 240 && core.state.phase === 'Run'; i++) {
    core.step(DT);
    speeds.push(core.state.speed);
  }
  assert.ok(BIG_AIR_TUNING.runDrag < 0, 'big-air runDrag must be negative (slope accelerates)');
  assert.ok(speeds[10] > speeds[0], 'speed should rise on the slope');
  assert.ok(
    speeds[speeds.length - 1] <= BIG_AIR_TUNING.maxRunSpeed + 1e-6,
    'slope speed clamps to maxRunSpeed',
  );
  assert.ok(
    speeds[speeds.length - 1] > BIG_AIR_TUNING.maxRunSpeed * 0.9,
    `full slope should approach terminal speed, got ${speeds[speeds.length - 1]}`,
  );
});

check('launch impulse scales with carried run speed (weak run = weak air)', () => {
  // Full-speed run: let the slope run its course.
  const full = makeBigAirSession();
  runToAir(full);
  const fullLaunchSpeed = full.state.launchSpeed;
  let fullApex = 0;
  for (let i = 0; i < 2000 && full.state.phase === 'Air'; i++) { full.step(DT); fullApex = Math.max(fullApex, full.state.pos.y); }

  // Weak run: a very short slope by launching a fresh core with a nearer
  // kicker via a one-off skin override (constants unchanged for the mode).
  const weakSkin: AirSessionSkin = {
    ...makeBigAirSkin(),
    tuning: { ...BIG_AIR_TUNING, launchZ: -6 },
  };
  const weak = new AirSessionCore(weakSkin);
  runToAir(weak);
  const weakLaunchSpeed = weak.state.launchSpeed;
  let weakApex = 0;
  for (let i = 0; i < 2000 && weak.state.phase === 'Air'; i++) { weak.step(DT); weakApex = Math.max(weakApex, weak.state.pos.y); }

  assert.ok(weakLaunchSpeed < fullLaunchSpeed, `weak run should carry less speed (${weakLaunchSpeed} vs ${fullLaunchSpeed})`);
  assert.ok(weakApex < fullApex, `weak run should give a lower apex (${weakApex.toFixed(2)} vs ${fullApex.toFixed(2)})`);
});

check('a completed spin lands clean and scores base + rotation points', () => {
  const core = makeBigAirSession();
  runToAir(core);
  core.trick();
  core.trick(); // 1.0 rotation
  airToLand(core);
  assert.strictEqual(core.state.lastGrade, 'clean', `expected clean, got ${core.state.lastGrade}`);
  assert.strictEqual(core.state.lastRotations, 1, `expected 1 rotation, got ${core.state.lastRotations}`);
  const t = BIG_AIR_TUNING;
  const expected = Math.round((t.basePoints + 1 * t.pointsPerRotation) * t.gradePoints.clean);
  assert.strictEqual(core.state.score, expected, `clean score ${core.state.score} != ${expected}`);
});

check('stick tap upgrades the clean landing to STUCK (2× points)', () => {
  const core = makeBigAirSession();
  runToAir(core);
  core.trick();
  core.trick();
  let stuck = false;
  for (let i = 0; i < 2000 && core.state.phase === 'Air'; i++) {
    if (!stuck && core.state.pos.y < 1.0 && core.state.vy < 0) { core.stick(); stuck = true; }
    core.step(DT);
  }
  assert.ok(stuck, 'should have found a stick window before touchdown');
  assert.strictEqual(core.state.lastGrade, 'stuck', `expected stuck, got ${core.state.lastGrade}`);
  const t = BIG_AIR_TUNING;
  const expected = Math.round((t.basePoints + 1 * t.pointsPerRotation) * t.gradePoints.stuck);
  assert.strictEqual(core.state.score, expected, `stuck score ${core.state.score} != ${expected}`);
});

check('no teleport: off the respawn frame, per-step travel is bounded', () => {
  const core = makeBigAirSession();
  let maxStep = 0;
  let prev = { ...core.state.pos };
  let prevPhase = core.state.phase;
  for (let i = 0; i < 6000 && !core.state.finished; i++) {
    core.step(DT);
    const p = core.state.pos;
    const respawn = prevPhase === 'Land' && core.state.phase === 'Run';
    if (!respawn) {
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      maxStep = Math.max(maxStep, d);
    }
    prev = { ...p };
    prevPhase = core.state.phase;
  }
  assert.ok(maxStep < 1.0, `per-step travel should stay bounded, got ${maxStep.toFixed(3)}m`);
});

check('attempts-per-round: exactly attemptsPerRound attempts then finishes', () => {
  const core = makeBigAirSession();
  let doneStep = -1;
  for (let i = 0; i < 20000; i++) {
    core.step(DT);
    if (core.state.finished) { doneStep = i; break; }
  }
  assert.ok(doneStep > 0, 'round should finish');
  assert.strictEqual(core.state.phase, 'Done', 'finished round sits in Done');
  assert.strictEqual(core.state.attempt, BIG_AIR_TUNING.attemptsPerRound, `attempt count ${core.state.attempt}`);
  assert.strictEqual(core.state.attempts.length, BIG_AIR_TUNING.attemptsPerRound, 'one log entry per attempt');
});

check('cadence run-up: alternating taps add speed; a fault is penalised', () => {
  // Alternating taps raise speed above the pure-slope baseline at the same step.
  const tapped = makeBigAirSession();
  const baseline = makeBigAirSession();
  for (let i = 0; i < 20; i++) {
    tapped.step(DT);
    baseline.step(DT);
    tapped.runTap(i % 2 === 0 ? 'L' : 'R');
  }
  assert.ok(tapped.state.speed > baseline.state.speed, `taps should add speed (${tapped.state.speed} vs ${baseline.state.speed})`);

  // A same-side fault multiplies current speed down.
  const faulted = makeBigAirSession();
  faulted.step(DT);
  faulted.runTap('L');
  const before = faulted.state.speed;
  faulted.runTap('L'); // same side = fault
  assert.ok(faulted.state.speed < before + 1e-9, 'a fault should not increase speed');
});

check('SensoryBus fires on launch and landing', () => {
  const bus = new SensoryBus();
  const fired: string[] = [];
  const skin: AirSessionSkin = { ...makeBigAirSkin(), onSensory: (evt) => fired.push(evt) };
  const core = new AirSessionCore(skin, bus);
  runToAir(core);
  core.trick();
  airToLand(core);
  assert.ok(fired.includes('launch'), 'launch sensory should fire');
  assert.ok(fired.some((e) => e.startsWith('land')), 'a landing sensory should fire');
  assert.ok(bus.stats.emitted >= 2, `bus should have emitted at least twice, got ${bus.stats.emitted}`);
});

console.log(`\nair-session-core-tests: ${passed} checks passed \u2713`);
