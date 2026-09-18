/**
 * scripts/sprint-core-tests.ts
 * ============================
 * M9 Step 11 verification harness for the Sprint race core
 * (lib/feel/cores/sprint-core.ts) + sprint skin (sprint-skin.ts) — the
 * Rhythm/UI archetype's own focused race core (quiz modes use QuizCore
 * directly; a race needs a start gate + physics).
 *
 * Drives the headless core at a fixed 60Hz. To tap on a cadence, the harness
 * advances the clock in whole 60Hz frames and taps at the frame nearest the
 * target interval, so the cadence clock (which reads the core's fixed-step
 * clock) sees on-tempo alternating steps. Proves:
 *   1. Start gate walks Ready -> Set -> Go automatically on the clock.
 *   2. REAL false start: a tap during Ready/Set increments falseStarts and
 *      resets to Ready (the gate restarts).
 *   3. On-cadence alternating taps after GO build speed and finish the 100m;
 *      finishTimeS is recorded and phase reaches Finish.
 *   4. Same-side tap is a STUMBLE that reduces speed (penalty applied).
 *   5. No teleport: per-frame forward travel stays bounded (<= maxSpeed*dt+eps).
 *   6. Determinism: identical tap/tick script -> identical finish time.
 *   7. Sensory: the starting gun fires on the Go transition; finish fires a
 *      crowd event.
 *
 * Run: yarn tsx scripts/sprint-core-tests.ts
 * Wired into scripts/standing-suite.ts as the 15th standing suite.
 */

import assert from 'node:assert';
import { SprintCore } from '../lib/feel/cores/sprint-core';
import { makeSprintRace, makeSprintSkin, SPRINT_TUNING } from '../lib/feel/cores/sprint-skin';
import { SensoryBus, type SensoryEvent } from '../lib/feel';

const DT_MS = 1000 / 60;
/** Widen phase reads to defeat TS control-flow narrowing across tick(). */
function phaseOf(c: SprintCore): string { return c.phase as string; }

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Tick the core through the Ready->Set->Go gate until it reaches Go. */
function tickToGo(core: SprintCore, maxFrames = 400): number {
  let frames = 0;
  while (phaseOf(core) !== 'Go' && frames < maxFrames) {
    core.tick(DT_MS);
    frames++;
  }
  return frames;
}

/**
 * Run a full race: after GO, tap alternating L/R roughly every targetIntervalMs
 * by ticking whole frames between taps. Returns the final state.
 */
function runRace(core: SprintCore, sameSideStumbleAt = -1): void {
  tickToGo(core);
  const framesPerTap = Math.max(1, Math.round(SPRINT_TUNING.targetIntervalMs / DT_MS));
  let side: 'L' | 'R' = 'L';
  let taps = 0;
  let guard = 0;
  while (phaseOf(core) !== 'Finish' && guard < 20000) {
    for (let f = 0; f < framesPerTap && phaseOf(core) !== 'Finish'; f++) {
      core.tick(DT_MS);
      guard++;
    }
    if (phaseOf(core) === 'Finish') break;
    if (taps === sameSideStumbleAt) {
      core.step(side); // deliberately DON'T alternate -> stumble
    } else {
      core.step(side);
      side = side === 'L' ? 'R' : 'L';
    }
    taps++;
  }
}

console.log('Sprint race core (M9 Step 11)');

check('start gate walks Ready -> Set -> Go on the clock', () => {
  const core = makeSprintRace();
  assert.strictEqual(core.phase, 'Ready');
  const seen = new Set<string>([core.phase]);
  for (let i = 0; i < 400 && phaseOf(core) !== 'Go'; i++) {
    core.tick(DT_MS);
    seen.add(core.phase);
  }
  assert.ok(seen.has('Set'), 'passed through Set');
  assert.strictEqual(core.phase, 'Go', 'reached Go');
});

check('REAL false start: tap during Ready/Set resets the gate', () => {
  const core = makeSprintRace();
  // Tap immediately (during Ready).
  core.step('L');
  assert.strictEqual(core.state.falseStarts, 1, 'false start counted');
  assert.strictEqual(core.phase, 'Ready', 'sent back to Ready');
  // Advance into Set then tap again.
  for (let i = 0; i < Math.ceil(SPRINT_TUNING.readyMs / DT_MS) + 1; i++) core.tick(DT_MS);
  assert.strictEqual(core.phase, 'Set');
  core.step('R');
  assert.strictEqual(core.state.falseStarts, 2, 'second false start counted');
  assert.strictEqual(core.phase, 'Ready', 'reset to Ready again');
});

check('on-cadence taps finish the 100m with a recorded time', () => {
  const core = makeSprintRace();
  runRace(core);
  assert.strictEqual(core.phase, 'Finish', 'race finished');
  assert.ok(core.state.finishTimeS !== null && core.state.finishTimeS > 0, 'finish time recorded');
  assert.ok(core.state.distanceM >= SPRINT_TUNING.raceDistanceM - 0.5, 'ran the full distance');
  assert.ok(core.state.topSpeed > 0, 'built up speed');
});

check('same-side tap is a STUMBLE that bleeds speed', () => {
  const core = makeSprintRace();
  tickToGo(core);
  const fpt = Math.max(1, Math.round(SPRINT_TUNING.targetIntervalMs / DT_MS));
  // Build some speed with alternating taps.
  let side: 'L' | 'R' = 'L';
  for (let n = 0; n < 5; n++) {
    for (let f = 0; f < fpt; f++) core.tick(DT_MS);
    core.step(side);
    side = side === 'L' ? 'R' : 'L';
  }
  const before = core.state.speed;
  // Now tap the SAME side as last -> stumble.
  const sameAsLast: 'L' | 'R' = side === 'L' ? 'R' : 'L';
  core.step(sameAsLast);
  assert.strictEqual(core.state.lastStep, 'STUMBLE', 'registered a stumble');
  assert.ok(core.state.speed < before, `speed dropped (${before} -> ${core.state.speed})`);
});

check('no teleport: per-frame travel is bounded', () => {
  const core = makeSprintRace();
  tickToGo(core);
  const fpt = Math.max(1, Math.round(SPRINT_TUNING.targetIntervalMs / DT_MS));
  const maxStep = SPRINT_TUNING.maxSpeed * (DT_MS / 1000) + 1e-6;
  let side: 'L' | 'R' = 'L';
  let prevDist = core.state.distanceM;
  let guard = 0;
  while (phaseOf(core) !== 'Finish' && guard < 20000) {
    for (let f = 0; f < fpt && phaseOf(core) !== 'Finish'; f++) {
      core.tick(DT_MS);
      const d = core.state.distanceM;
      const delta = d - prevDist;
      assert.ok(delta <= maxStep + 1e-6, `frame travel ${delta} exceeded bound ${maxStep}`);
      prevDist = d;
      guard++;
    }
    core.step(side);
    side = side === 'L' ? 'R' : 'L';
  }
  assert.strictEqual(core.phase, 'Finish');
});

check('deterministic: identical script -> identical finish time', () => {
  const a = makeSprintRace();
  const b = makeSprintRace();
  runRace(a);
  runRace(b);
  assert.strictEqual(a.state.finishTimeS, b.state.finishTimeS, 'same finish time');
  assert.strictEqual(a.state.topSpeed, b.state.topSpeed, 'same top speed');
});

check('sensory: gun fires on Go, crowd fires on finish', () => {
  const events: SensoryEvent[] = [];
  const bus = new SensoryBus({});
  const core = new SprintCore(makeSprintSkin({ onSensory: (e) => events.push(e) }), bus);
  runRace(core);
  assert.ok(events.some((e) => e.sfx === 'impact'), 'gun (impact) fired');
  assert.ok(events.some((e) => e.sfx === 'crowd'), 'finish (crowd) fired');
});

console.log(`\nSprint core: ${passed}/${passed} checks passed.`);
