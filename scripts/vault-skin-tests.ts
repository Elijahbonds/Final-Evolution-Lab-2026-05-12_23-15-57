/**
 * scripts/vault-skin-tests.ts
 * ===========================
 * M9 Step 8 verification harness for the Vault (gymnastics) skin
 * (lib/feel/cores/vault-skin.ts + vault-constants.ts) on the Air-session
 * core (lib/feel/cores/air-session-core.ts).
 *
 * Vault is the Air-session archetype with a POSITIVE-runDrag runway: unlike
 * big-air's self-accelerating slope, you MUST pump the cadence to build
 * speed. Proves, by driving the headless core at a fixed 60Hz:
 *   1. Positive runDrag stall: with NO taps the runway never launches
 *      (weak run = no vault) — the core's run styles are constants-only.
 *   2. Cadence run-up: alternating taps build speed to the table and launch,
 *      then phase-walk Run → Air → Land.
 *   3. A completed flip lands clean and scores basePoints + rot×perRotation.
 *   4. Stick tap in the window upgrades the clean landing to STUCK (2×).
 *   5. No teleport: off the respawn frame, per-step travel is bounded.
 *   6. Attempts-per-round: exactly attemptsPerRound vaults then finishes.
 *   7. SensoryBus fires on launch (board punch) + landing.
 *
 * Run: yarn tsx scripts/vault-skin-tests.ts
 * Wired into scripts/standing-suite.ts as the 12th standing suite.
 */

import assert from 'node:assert';
import { AirSessionCore, type AirSessionSkin, type AirPhase } from '../lib/feel/cores/air-session-core';
import { makeVaultSession, makeVaultSkin, VAULT_TUNING } from '../lib/feel/cores/vault-skin';
import { SensoryBus } from '../lib/feel';

const DT = 1 / 60;
const PERIOD = Math.round(VAULT_TUNING.cadenceTargetMs / (DT * 1000)); // frames between taps

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Drive the runway with an on-cadence alternating tap until Air, then flip. */
function runToAirWithCadence(core: AirSessionCore, flips = 0, maxFrames = 2000): void {
  let side: 'L' | 'R' = 'L';
  let flipped = 0;
  for (let i = 0; i < maxFrames; i++) {
    if (core.state.phase === 'Run' && i % PERIOD === 0) {
      core.runTap(side);
      side = side === 'L' ? 'R' : 'L';
    }
    if (core.state.phase === 'Air' && flipped < flips) {
      core.trick();
      flipped++;
    }
    core.step(DT);
    if (core.state.phase === 'Air' && flipped >= flips) return;
  }
  throw new Error('never launched with cadence');
}

console.log('vault-skin-tests (gymnastics vault on Air-session core):');

check('positive runDrag: with NO taps the runway never launches', () => {
  assert.ok(VAULT_TUNING.runDrag > 0, 'vault runDrag must be positive (runway friction)');
  const core = makeVaultSession();
  let launched = false;
  for (let i = 0; i < 1200; i++) {
    core.step(DT);
    if (core.state.phase === 'Air') { launched = true; break; }
  }
  assert.ok(!launched, 'a still runway (no cadence) must not vault');
  assert.ok(core.state.speed < 1e-6, `speed should stay ~0, got ${core.state.speed}`);
});

check('cadence run-up builds speed and phase-walks Run → Air → Land', () => {
  const core = makeVaultSession();
  const seen: AirPhase[] = [core.state.phase];
  let side: 'L' | 'R' = 'L';
  for (let i = 0; i < 2000; i++) {
    if (core.state.phase === 'Run' && i % PERIOD === 0) { core.runTap(side); side = side === 'L' ? 'R' : 'L'; }
    core.step(DT);
    const p = core.state.phase;
    if (seen[seen.length - 1] !== p) seen.push(p);
    if (p === 'Land') break;
  }
  assert.deepStrictEqual(seen, ['Run', 'Air', 'Land'], `unexpected phase walk: ${seen.join('→')}`);
  assert.ok(core.state.launchSpeed > 0, 'cadence should carry speed into the launch');
});

check('a completed flip lands clean and scores base + rotation points', () => {
  const core = makeVaultSession();
  runToAirWithCadence(core, 2); // 2 taps = 1.0 rotation
  for (let i = 0; i < 2000 && core.state.phase === 'Air'; i++) core.step(DT);
  assert.strictEqual(core.state.lastGrade, 'clean', `expected clean, got ${core.state.lastGrade}`);
  assert.strictEqual(core.state.lastRotations, 1, `expected 1 rotation, got ${core.state.lastRotations}`);
  const t = VAULT_TUNING;
  const expected = Math.round((t.basePoints + 1 * t.pointsPerRotation) * t.gradePoints.clean);
  assert.strictEqual(core.state.score, expected, `clean score ${core.state.score} != ${expected}`);
});

check('stick tap upgrades the clean landing to STUCK (2× points)', () => {
  const core = makeVaultSession();
  runToAirWithCadence(core, 2);
  let stuck = false;
  for (let i = 0; i < 2000 && core.state.phase === 'Air'; i++) {
    if (!stuck && core.state.pos.y < 1.0 && core.state.vy < 0) { core.stick(); stuck = true; }
    core.step(DT);
  }
  assert.ok(stuck, 'should have found a stick window');
  assert.strictEqual(core.state.lastGrade, 'stuck', `expected stuck, got ${core.state.lastGrade}`);
  const t = VAULT_TUNING;
  const expected = Math.round((t.basePoints + 1 * t.pointsPerRotation) * t.gradePoints.stuck);
  assert.strictEqual(core.state.score, expected, `stuck score ${core.state.score} != ${expected}`);
});

check('no teleport: off the respawn frame, per-step travel is bounded', () => {
  const core = makeVaultSession();
  let maxStep = 0;
  let prev = { ...core.state.pos };
  let prevPhase = core.state.phase;
  let side: 'L' | 'R' = 'L';
  for (let i = 0; i < 8000 && !core.state.finished; i++) {
    if (core.state.phase === 'Run' && i % PERIOD === 0) { core.runTap(side); side = side === 'L' ? 'R' : 'L'; }
    core.step(DT);
    const p = core.state.pos;
    const respawn = prevPhase === 'Land' && core.state.phase === 'Run';
    if (!respawn) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
    prev = { ...p };
    prevPhase = core.state.phase;
  }
  assert.ok(maxStep < 1.0, `per-step travel should stay bounded, got ${maxStep.toFixed(3)}m`);
});

check('attempts-per-round: exactly attemptsPerRound vaults then finishes', () => {
  const core = makeVaultSession();
  let side: 'L' | 'R' = 'L';
  let doneStep = -1;
  for (let i = 0; i < 20000; i++) {
    if (core.state.phase === 'Run' && i % PERIOD === 0) { core.runTap(side); side = side === 'L' ? 'R' : 'L'; }
    core.step(DT);
    if (core.state.finished) { doneStep = i; break; }
  }
  assert.ok(doneStep > 0, 'round should finish');
  assert.strictEqual(core.state.phase, 'Done', 'finished round sits in Done');
  assert.strictEqual(core.state.attempt, VAULT_TUNING.attemptsPerRound, `attempt count ${core.state.attempt}`);
  assert.strictEqual(core.state.attempts.length, VAULT_TUNING.attemptsPerRound, 'one log entry per vault');
});

check('SensoryBus fires on launch and landing', () => {
  const bus = new SensoryBus();
  const fired: string[] = [];
  const skin: AirSessionSkin = { ...makeVaultSkin(), onSensory: (evt) => fired.push(evt) };
  const core = new AirSessionCore(skin, bus);
  runToAirWithCadence(core, 1);
  for (let i = 0; i < 2000 && core.state.phase === 'Air'; i++) core.step(DT);
  assert.ok(fired.includes('launch'), 'launch (board punch) sensory should fire');
  assert.ok(fired.some((e) => e.startsWith('land')), 'a landing sensory should fire');
  assert.ok(bus.stats.emitted >= 2, `bus should have emitted at least twice, got ${bus.stats.emitted}`);
});

console.log(`\nvault-skin-tests: ${passed} checks passed \u2713`);
