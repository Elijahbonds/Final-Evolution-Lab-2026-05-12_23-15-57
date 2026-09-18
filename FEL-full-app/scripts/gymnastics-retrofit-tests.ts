#!/usr/bin/env -S yarn tsx
/**
 * scripts/gymnastics-retrofit-tests.ts
 * ====================================
 * M10 Row 4 retrofit invariant — gymnastics surface -> AirSessionCore (VAULT skin).
 *
 * The live gymnastics surface (components/games/gymnastics-game.tsx) no longer
 * owns any physics: it drives the M9 AirSessionCore wearing the vault skin,
 * exactly as the component does (step(dt) + runTap/trick/stick, phase-guarded).
 * These invariants pin the CONTRACT the surface relies on so a future core or
 * tuning change cannot silently break it:
 *   1. VAULT is a CADENCE run-up: POSITIVE runDrag means no taps => no speed =>
 *      you never reach the table (unlike big-air's self-accelerating slope).
 *   2. Alternating L/R cadence taps build speed and DO reach the table + launch.
 *   3. A faster run-up yields a bigger punch off the table (weak run -> weak air).
 *   4. Mid-air trick() taps add rotation; hold-through-descent stick() upgrades
 *      a clean landing to STUCK (2x points in the tuned grade table).
 *   5. Exactly attemptsPerRound (2) attempts, then phase Done + finished.
 *   6. The surface WIN_SCORE (800) is reachable with strong stuck vaults.
 *
 * Deterministic: fixed 60fps clock, scripted inputs. No RNG, no rendering.
 */

import { makeVaultSession, VAULT_TUNING } from '../lib/feel/cores/vault-skin';
import type { AirSessionCore } from '../lib/feel/cores/air-session-core';
import type { CadenceSide } from '../lib/feel';
import assert from 'node:assert';

const DT = 1 / 60;
const WIN_SCORE = 800; // must match components/games/gymnastics-game.tsx
function phaseOf(c: AirSessionCore): string { return c.state.phase as string; }
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }

function stepUntilLeaves(c: AirSessionCore, from: string, guard = 6000): void {
  let n = 0;
  while (phaseOf(c) === from && n < guard) { c.step(DT); n++; }
}

// Pump an alternating cadence run-up: tap L/R spaced by ~targetIntervalMs,
// stepping the core between taps, until launch (or a guard trips).
function runUp(c: AirSessionCore, intervalMs = VAULT_TUNING.cadenceTargetMs): void {
  const stepsBetween = Math.max(1, Math.round((intervalMs / 1000) / DT));
  let side: CadenceSide = 'L';
  let taps = 0;
  while (phaseOf(c) === 'Run' && taps < 400) {
    c.runTap(side);
    side = side === 'L' ? 'R' : 'L';
    taps++;
    for (let i = 0; i < stepsBetween && phaseOf(c) === 'Run'; i++) c.step(DT);
  }
}

// Play one full attempt: run up to launch, do `tricks` mid-air taps, optionally
// hold-to-stick during the descent, then ride the arc down into Land.
function playAttempt(c: AirSessionCore, tricks: number, stick: boolean): void {
  runUp(c);
  for (let i = 0; i < tricks; i++) c.trick();
  let n = 0;
  while (phaseOf(c) === 'Air' && n < 6000) {
    if (stick && c.state.vy < 0) c.stick();
    c.step(DT);
    n++;
  }
}

// ---- 1. POSITIVE runDrag: no taps => never launches ----------------------
check('vault is a cadence run-up: no taps => no speed => never reaches the table', () => {
  assert.ok(VAULT_TUNING.runDrag > 0, 'vault runDrag is POSITIVE (you must pump)');
  const c = makeVaultSession();
  for (let i = 0; i < 600; i++) c.step(DT); // 10s of idling, zero taps
  assert.strictEqual(c.state.speed, 0, 'no speed accrues without taps');
  assert.strictEqual(phaseOf(c), 'Run', 'still stuck on the runway — never auto-launched');
});

// ---- 2. Cadence taps build speed and launch ------------------------------
check('alternating L/R cadence taps build speed and launch off the table', () => {
  const c = makeVaultSession();
  runUp(c);
  assert.strictEqual(phaseOf(c), 'Air', 'pumping the cadence reached the table and launched');
  assert.ok(c.state.launchSpeed > 0, 'carried real speed into the air');
  assert.ok(c.state.vy > 0, 'punched up off the board');
});

// ---- 3. Faster run-up => bigger punch ------------------------------------
check('a faster run-up yields a bigger launch (weak run -> weak air)', () => {
  const t = VAULT_TUNING;
  // Brisk cadence near the perfect interval.
  const fast = makeVaultSession();
  runUp(fast, t.cadenceTargetMs);
  // Lazy cadence: long gaps let drag bleed speed between strides.
  const slow = makeVaultSession();
  runUp(slow, t.cadenceTargetMs + t.cadenceGoodMs * 4);
  assert.ok(fast.state.launchSpeed > slow.state.launchSpeed, 'brisk cadence carries more speed');
  assert.ok(fast.state.vy > slow.state.vy, 'more carried speed => higher launch vy');
  // vy follows the tuned formula off the carried speed.
  const expected = t.baseLaunch + (fast.state.speed / t.maxRunSpeed) * t.speedLaunchBonus;
  assert.ok(Math.abs(fast.state.vy - expected) < 1e-6, 'launch vy uses the tuned speed formula');
});

// ---- 4. trick() rotation + stick upgrades to STUCK (2x) -------------------
check('trick() adds rotation; hold-to-stick upgrades a clean land to STUCK', () => {
  // Clean (no stick): two half-turns = 1.0 rotation, exact -> clean.
  const clean = makeVaultSession();
  playAttempt(clean, 2, false);
  assert.strictEqual(clean.state.attempts.length, 1);
  assert.strictEqual(clean.state.attempts[0].grade, 'clean');
  assert.ok(Math.abs(clean.state.attempts[0].rotations - 1.0) < 1e-6, 'two taps = 1.0 turn');

  // Same rotation but held to stick -> STUCK, worth 2x the clean points.
  const stuck = makeVaultSession();
  playAttempt(stuck, 2, true);
  assert.strictEqual(stuck.state.attempts[0].grade, 'stuck');
  assert.strictEqual(
    stuck.state.attempts[0].pts,
    clean.state.attempts[0].pts * 2,
    'STUCK scores exactly 2x CLEAN for the same rotation',
  );
});

// ---- 5. Exactly attemptsPerRound attempts, then Done ---------------------
check('round ends after attemptsPerRound (2) attempts, then finished', () => {
  assert.strictEqual(VAULT_TUNING.attemptsPerRound, 2);
  const c = makeVaultSession();
  for (let i = 0; i < VAULT_TUNING.attemptsPerRound; i++) {
    playAttempt(c, 1, false);
    stepUntilLeaves(c, 'Land'); // wait out the salute beat -> next Run or Done
  }
  assert.strictEqual(c.state.attempt, 2, 'exactly two scored vaults');
  assert.strictEqual(phaseOf(c), 'Done', 'round closed');
  assert.strictEqual(c.state.finished, true, 'finished flag set');
});

// ---- 6. WIN_SCORE reachable with strong stuck vaults ---------------------
check('WIN_SCORE (800) is reachable with strong stuck vaults', () => {
  const c = makeVaultSession();
  for (let i = 0; i < VAULT_TUNING.attemptsPerRound; i++) {
    playAttempt(c, 4, true); // 4 taps = 2.0 turns, stuck
    stepUntilLeaves(c, 'Land');
  }
  assert.strictEqual(phaseOf(c), 'Done');
  assert.ok(c.state.score >= WIN_SCORE, `gold reachable: scored ${c.state.score} >= ${WIN_SCORE}`);
});

console.log(`\ngymnastics-retrofit-tests: ${passed} checks passed`);
