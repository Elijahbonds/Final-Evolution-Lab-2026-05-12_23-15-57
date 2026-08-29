#!/usr/bin/env -S yarn tsx
/**
 * scripts/big-air-retrofit-tests.ts
 * =================================
 * M10 Row 5 retrofit invariant — big-air-3d.tsx -> AirSessionCore (big-air skin).
 *
 * The live 3D Big Air surface no longer owns its charge/air/land physics: it
 * drives the M9 AirSessionCore exactly as the component does (step(dt) +
 * runTap/trick/stick, phase-guarded). These invariants pin the CONTRACT the
 * component relies on so a future core change cannot silently break the surface:
 *   1. The slope self-accelerates with NO taps (negative runDrag) and launches.
 *   2. Launch impulse scales with carried run speed (weak run -> weak air).
 *   3. Mid-air trick() taps add rotation; hold-through-descent stick() upgrades
 *      a clean landing to STUCK (2x points in the tuned grade table).
 *   4. Exactly attemptsPerRound (3) attempts, then phase Done + finished.
 *   5. The component's WIN_SCORE (1000) is reachable with strong stuck runs.
 *
 * Deterministic: fixed 60fps clock, scripted inputs. No RNG, no rendering.
 */

import { makeBigAirSession, BIG_AIR_TUNING } from '../lib/feel/cores/big-air-skin';
import type { AirSessionCore } from '../lib/feel/cores/air-session-core';
import assert from 'node:assert';

const DT = 1 / 60;
const WIN_SCORE = 1000; // must match components/games/big-air-3d.tsx
function phaseOf(c: AirSessionCore): string { return c.state.phase as string; }
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }

// Step until the phase changes away from `from` (or a guard trips).
function stepUntilLeaves(c: AirSessionCore, from: string, guard = 6000): void {
  let n = 0;
  while (phaseOf(c) === from && n < guard) { c.step(DT); n++; }
}

// Play one full attempt: coast the slope to launch, do `tricks` mid-air taps,
// optionally hold to stick, then ride the arc down through touchdown into Land.
function playAttempt(c: AirSessionCore, tricks: number, stick: boolean): void {
  // Run -> Air
  stepUntilLeaves(c, 'Run');
  // Do the trick taps at the top of the arc.
  for (let i = 0; i < tricks; i++) c.trick();
  // Fly the arc; hold-to-stick during the descent like the component does.
  let n = 0;
  while (phaseOf(c) === 'Air' && n < 6000) {
    if (stick && c.state.vy < 0) c.stick();
    c.step(DT);
    n++;
  }
}

// ---- 1. Slope self-accelerates and launches with no taps -----------------
check('slope builds speed with no taps and launches (negative runDrag)', () => {
  const c = makeBigAirSession();
  assert.ok(BIG_AIR_TUNING.runDrag < 0, 'big-air runDrag is negative (slope accel)');
  assert.strictEqual(c.state.speed, 0);
  stepUntilLeaves(c, 'Run');
  assert.strictEqual(c.state.phase, 'Air', 'reached the kicker and launched');
  assert.ok(c.state.launchSpeed > 0, 'carried real speed into the air');
  assert.ok(c.state.vy > 0, 'left the lip going up');
});

// ---- 2. Launch impulse scales with carried run speed ---------------------
check('launch vy scales with carried run speed via the tuned formula', () => {
  const c = makeBigAirSession();
  stepUntilLeaves(c, 'Run');
  const t = BIG_AIR_TUNING;
  // The core sets vy = baseLaunch + (speed/maxRunSpeed)*speedLaunchBonus.
  const expected = t.baseLaunch + (c.state.speed / t.maxRunSpeed) * t.speedLaunchBonus;
  assert.ok(Math.abs(c.state.vy - expected) < 1e-6, 'vy follows the speed->launch formula');
  // Real carried speed genuinely adds to the floor (weak run would be weaker).
  assert.ok(c.state.vy > t.baseLaunch, 'carried speed lifts vy above the base launch');
  assert.ok(c.state.speed > 0 && c.state.speed <= t.maxRunSpeed, 'speed within tuned range');
});

// ---- 3. trick() rotation + stick upgrades to STUCK (2x) -------------------
check('trick() adds rotation; hold-to-stick upgrades a clean land to STUCK', () => {
  // Clean (no stick): two half-turns = 1.0 rotation, exact -> clean.
  const clean = makeBigAirSession();
  playAttempt(clean, 2, false);
  assert.strictEqual(clean.state.attempts.length, 1);
  assert.strictEqual(clean.state.attempts[0].grade, 'clean');
  assert.ok(Math.abs(clean.state.attempts[0].rotations - 1.0) < 1e-6, 'two taps = 1.0 turn');

  // Same rotation but held to stick -> STUCK, worth 2x the clean points.
  const stuck = makeBigAirSession();
  playAttempt(stuck, 2, true);
  assert.strictEqual(stuck.state.attempts[0].grade, 'stuck');
  assert.ok(
    stuck.state.attempts[0].pts === clean.state.attempts[0].pts * 2,
    'STUCK scores exactly 2x CLEAN for the same rotation',
  );
});

// ---- 4. Exactly attemptsPerRound attempts, then Done ---------------------
check('round ends after attemptsPerRound (3) attempts, then finished', () => {
  const c = makeBigAirSession();
  assert.strictEqual(BIG_AIR_TUNING.attemptsPerRound, 3);
  for (let i = 0; i < BIG_AIR_TUNING.attemptsPerRound; i++) {
    playAttempt(c, 1, false);
    stepUntilLeaves(c, 'Land'); // wait out the land beat -> next Run or Done
  }
  assert.strictEqual(c.state.attempt, 3, 'exactly three scored attempts');
  assert.strictEqual(c.state.phase, 'Done', 'round closed');
  assert.strictEqual(c.state.finished, true, 'finished flag set');
});

// ---- 5. WIN_SCORE is reachable with strong stuck runs --------------------
check('WIN_SCORE (1000) is reachable with strong stuck landings', () => {
  const c = makeBigAirSession();
  for (let i = 0; i < BIG_AIR_TUNING.attemptsPerRound; i++) {
    playAttempt(c, 4, true); // 4 taps = 2.0 turns, stuck
    stepUntilLeaves(c, 'Land');
  }
  assert.strictEqual(c.state.phase, 'Done');
  assert.ok(c.state.score >= WIN_SCORE, `gold reachable: scored ${c.state.score} >= ${WIN_SCORE}`);
});

console.log(`\nbig-air-retrofit-tests: ${passed} checks passed`);
