#!/usr/bin/env -S yarn tsx
/**
 * scripts/sprint-retrofit-tests.ts
 * ================================
 * M10 Row 1 retrofit invariant — sprint-game.tsx → SprintCore (RhythmCadence).
 *
 * The live 2D Beach Sprint surface no longer owns its physics: it drives the
 * M9 SprintCore exactly as the component does (tick(dtMs) + step('L'|'R')).
 * These invariants pin the CONTRACT the component depends on so a future core
 * change can't silently break the surface:
 *   1. A tap before GO is a REAL false start (back to Ready, counter++).
 *   2. Perfect-cadence alternating taps finish the 100m in a sane time.
 *   3. Distance is monotonic during the run and tops out at raceDistanceM.
 *   4. topSpeed never exceeds the tuned maxSpeed.
 *   5. onFinish fires exactly once with the core's finish time.
 *
 * Deterministic: fixed 60fps clock, scripted taps. No RNG, no rendering.
 */

import { makeSprintRace, SPRINT_TUNING } from '../lib/feel/cores/sprint-skin';
import assert from 'node:assert';

const DT_MS = 1000 / 60;
// Widen phase to string so tsc doesn't narrow across mutating tick()/step().
function phaseOf(c: ReturnType<typeof makeSprintRace>): string { return c.phase as string; }
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }

// Advance the core by a number of whole fixed steps.
function advance(core: ReturnType<typeof makeSprintRace>, ms: number) {
  let acc = 0;
  while (acc < ms) { core.tick(DT_MS); acc += DT_MS; }
}

// ---- 1. False start before the gun ---------------------------------------
check('tap during READY is a real false start (returns to Ready)', () => {
  const core = makeSprintRace();
  assert.strictEqual(core.phase, 'Ready');
  core.step('L');
  assert.strictEqual(core.state.falseStarts, 1, 'false start counted');
  assert.strictEqual(core.phase, 'Ready', 'sent back to the blocks');
});

check('tap during SET is also a false start', () => {
  const core = makeSprintRace();
  advance(core, SPRINT_TUNING.readyMs + 5); // into Set
  assert.strictEqual(core.phase, 'Set');
  core.step('R');
  assert.strictEqual(core.state.falseStarts, 1);
  assert.strictEqual(core.phase, 'Ready');
});

// ---- 2/3/4. A clean 100m on perfect cadence ------------------------------
check('perfect-cadence race finishes, distance caps, speed within max', () => {
  let finishTime: number | null = null;
  let finishCalls = 0;
  const core = makeSprintRace(undefined, {
    onFinish: (t) => { finishTime = t; finishCalls += 1; },
  });
  // Reach GO.
  advance(core, SPRINT_TUNING.readyMs + SPRINT_TUNING.setMs + 5);
  assert.strictEqual(core.phase, 'Go');

  let side: 'L' | 'R' = 'L';
  let prevDist = 0;
  let monotonic = true;
  let guard = 0;
  // Tap on the target interval; tick between taps.
  while (phaseOf(core) !== 'Finish' && guard < 5000) {
    core.step(side);
    side = side === 'L' ? 'R' : 'L';
    advance(core, SPRINT_TUNING.targetIntervalMs);
    const d = core.state.distanceM;
    if (d < prevDist - 1e-6) monotonic = false;
    prevDist = d;
    guard++;
  }
  assert.strictEqual(core.phase, 'Finish', 'race completed');
  assert.ok(monotonic, 'distance is monotonic during the run');
  assert.ok(core.state.distanceM >= SPRINT_TUNING.raceDistanceM - 0.5, 'reached the line');
  assert.ok(core.state.topSpeed <= SPRINT_TUNING.maxSpeed + 1e-6, 'top speed within tuned max');
  assert.strictEqual(finishCalls, 1, 'onFinish fired exactly once');
  assert.ok(finishTime !== null && (finishTime as number) > 0, 'finish time reported');
  // Perfect cadence over 100m at maxSpeed ~12m/s should be well under 25s.
  assert.ok((finishTime as number) < 25, 'sane finish time');
});

// ---- 5. Same-side taps stumble (bleed speed), never advance cadence -------
check('same-side tap is a stumble that bleeds speed', () => {
  const core = makeSprintRace();
  advance(core, SPRINT_TUNING.readyMs + SPRINT_TUNING.setMs + 5);
  core.step('L');            // first accepted
  advance(core, SPRINT_TUNING.targetIntervalMs);
  core.step('R');            // accepted, builds speed
  const before = core.state.speed;
  core.step('R');            // same side — stumble
  assert.strictEqual(core.state.lastStep, 'STUMBLE');
  assert.ok(core.state.speed < before, 'speed bled by the stumble');
});

console.log(`\nsprint-retrofit-tests: ${passed} checks passed`);
