/**
 * scripts/court-core-tests.ts
 * ===========================
 * M9 Step 2 verification harness for the Court/free-3D archetype core
 * (lib/feel/cores/court-core.ts) skinned as the dunk reference
 * (lib/feel/cores/dunk-skin.ts).
 *
 * Proves, by driving the headless core at a fixed 60Hz:
 *   1. Full phase walk Idle→Approach→JumpPrep→Ascent→Peak→Descent→
 *      Contact→Landing→Idle emitted in order.
 *   2. Reference dunk kinematics: apex ≈ 1.36m, hang ≈ 0.50s using the
 *      shared feelConfig values verbatim (FEEL_REFERENCE_SPEC measured line).
 *   3. ArcDrive rim lock-on: 10/10 loops complete the drive with NO teleport
 *      (no single 16ms step displaces the body beyond a continuous bound).
 *   4. Buffered jump fires the instant landing recovery ends (buffered-press).
 *   5. Camera apex-follow (targetY rises airborne) + velocity FOV stretch.
 *
 * Run: yarn tsx scripts/court-core-tests.ts
 * Wired into scripts/standing-suite.ts as the 6th standing suite.
 */

import assert from 'node:assert';
import { CourtCore, type CourtPhase } from '../lib/feel/cores/court-core';
import { makeDunkSkin } from '../lib/feel/cores/dunk-skin';

const DT = 1 / 60;
const NO_MOVE = { moveX: 0, moveY: 0, camYaw: 0 };
const FWD = { moveX: 0, moveY: -1, camYaw: 0 };

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Run the core to ground, returning the ordered list of phase transitions. */
function runJump(
  start: { x: number; z: number },
  opts: { moveBeforeJump?: number } = {},
): { phases: CourtPhase[]; core: CourtCore } {
  const phases: CourtPhase[] = [];
  const skin = makeDunkSkin({ onPhase: (_f, to) => phases.push(to) });
  const core = new CourtCore(skin, start);
  // Optional grounded run-up so an Approach phase is entered.
  for (let i = 0; i < (opts.moveBeforeJump ?? 0); i++) core.step(DT, FWD);
  core.pressJump();
  for (let i = 0; i < 800; i++) {
    const s = core.step(DT, NO_MOVE);
    if (i > 5 && !s.airborne && s.phase === 'Idle') break;
  }
  return { phases, core };
}

console.log('court-core-tests: Court/free-3D core skinned as dunk reference\n');

// 1. Full phase walk -------------------------------------------------------
check('phase walk hits Approach→JumpPrep→Ascent→Peak→Descent→Contact→Landing', () => {
  // Start far from the hoop so the jump is ballistic (no lock-on skips Peak).
  const { phases } = runJump({ x: 0, z: 8 }, { moveBeforeJump: 30 });
  const order: CourtPhase[] = [
    'Approach', 'JumpPrep', 'Ascent', 'Peak', 'Descent', 'Contact', 'Landing',
  ];
  let idx = 0;
  for (const p of phases) {
    if (p === order[idx]) idx++;
    if (idx === order.length) break;
  }
  assert.strictEqual(
    idx, order.length,
    `expected ordered phases ${order.join('→')}, got ${phases.join(',')}`,
  );
});

check('returns to Idle after landing recovery', () => {
  const { core } = runJump({ x: 0, z: 8 });
  assert.strictEqual(core.state.phase, 'Idle');
  assert.strictEqual(core.state.airborne, false);
  assert.ok(Math.abs(core.state.pos.y) < 1e-6, 'feet back on floor');
});

// 2. Reference dunk kinematics ---------------------------------------------
check('ballistic apex ≈ 1.36m (shared feelConfig verbatim)', () => {
  const { core } = runJump({ x: 0, z: 8 });
  // apex captured on state during flight; re-run capturing max height.
  const skin = makeDunkSkin();
  const c = new CourtCore(skin, { x: 0, z: 8 });
  c.pressJump();
  let apex = 0;
  for (let i = 0; i < 800; i++) {
    const s = c.step(DT, NO_MOVE);
    apex = Math.max(apex, s.pos.y);
    if (i > 5 && !s.airborne && s.phase === 'Idle') break;
  }
  assert.ok(apex >= 1.30 && apex <= 1.42, `apex ${apex.toFixed(3)}m out of [1.30,1.42]`);
});

check('hang time ≈ 0.50s inside peak window', () => {
  const skin = makeDunkSkin();
  const c = new CourtCore(skin, { x: 0, z: 8 });
  c.pressJump();
  for (let i = 0; i < 800; i++) {
    const s = c.step(DT, NO_MOVE);
    if (i > 5 && !s.airborne && s.phase === 'Idle') break;
  }
  const hang = c.state.hangTime;
  assert.ok(hang >= 0.44 && hang <= 0.58, `hang ${hang.toFixed(3)}s out of [0.44,0.58]`);
});

// 3. ArcDrive rim lock-on, zero-teleport ×10 ------------------------------
check('rim lock-on completes 10/10 loops with no teleport step', () => {
  const MAX_STEP = 0.30; // m per 16ms — continuous drive peak (~11 m/s), not a jump-cut
  for (let loop = 0; loop < 10; loop++) {
    let lockDone = false;
    const skin = makeDunkSkin({ onSensory: (e) => { if (e === 'lockOnComplete') lockDone = true; } });
    const c = new CourtCore(skin, { x: 0, z: 2 }); // within lockOnRadius of hoop@z=0
    c.pressJump();
    let prev = { x: c.state.pos.x, y: c.state.pos.y, z: c.state.pos.z };
    let maxStep = 0;
    for (let i = 0; i < 800; i++) {
      const s = c.step(DT, NO_MOVE);
      const d = Math.hypot(s.pos.x - prev.x, s.pos.y - prev.y, s.pos.z - prev.z);
      maxStep = Math.max(maxStep, d);
      prev = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
      if (i > 5 && !s.airborne && s.phase === 'Idle') break;
    }
    assert.ok(lockDone, `loop ${loop}: lock-on never completed`);
    assert.ok(maxStep <= MAX_STEP, `loop ${loop}: teleport step ${maxStep.toFixed(3)}m > ${MAX_STEP}`);
  }
});

check('far jump takes no lock-on (plain ballistic)', () => {
  let locked = false;
  const skin = makeDunkSkin({ onSensory: (e) => { if (e === 'lockOnComplete') locked = true; } });
  const c = new CourtCore(skin, { x: 0, z: 9 }); // outside lockOnRadius
  c.pressJump();
  for (let i = 0; i < 800; i++) {
    const s = c.step(DT, NO_MOVE);
    if (i > 5 && !s.airborne && s.phase === 'Idle') break;
  }
  assert.strictEqual(locked, false, 'distant jump should not lock on');
});

// 4. Buffered jump fires on landing ---------------------------------------
check('jump buffered during landing recovery fires after recovery', () => {
  const skin = makeDunkSkin();
  const c = new CourtCore(skin, { x: 0, z: 8 });
  // First jump.
  c.pressJump();
  let landedTick = -1;
  let takeoffs = 0;
  let prevAir = false;
  for (let i = 0; i < 400; i++) {
    const s = c.step(DT, NO_MOVE);
    if (!prevAir && s.airborne) takeoffs++;
    prevAir = s.airborne;
    // The instant we enter Landing recovery, buffer a second jump.
    if (s.phase === 'Landing' && landedTick < 0) {
      landedTick = i;
      c.pressJump();
    }
    if (landedTick >= 0 && i > landedTick + 60 && takeoffs >= 2) break;
  }
  assert.ok(takeoffs >= 2, `buffered jump should trigger a 2nd takeoff, got ${takeoffs}`);
});

// 5. Camera apex-follow + FOV stretch -------------------------------------
check('camera targetY rises while airborne (apex follow)', () => {
  const skin = makeDunkSkin();
  const c = new CourtCore(skin, { x: 0, z: 8 });
  const groundTargetY = c.camera.targetY;
  c.pressJump();
  let maxTargetY = -Infinity;
  for (let i = 0; i < 200; i++) {
    const s = c.step(DT, NO_MOVE);
    maxTargetY = Math.max(maxTargetY, c.camera.targetY);
    if (i > 5 && !s.airborne && s.phase === 'Idle') break;
  }
  assert.ok(maxTargetY > groundTargetY + 0.1, `targetY should lift airborne (${groundTargetY.toFixed(2)}→${maxTargetY.toFixed(2)})`);
});

check('camera FOV stretches with planar speed', () => {
  const skin = makeDunkSkin();
  const c = new CourtCore(skin, { x: 0, z: 0 });
  let maxStretch = 1;
  for (let i = 0; i < 120; i++) {
    c.step(DT, FWD);
    maxStretch = Math.max(maxStretch, c.camera.fovStretch);
  }
  assert.ok(maxStretch > 1.02, `FOV should stretch at speed, got ${maxStretch.toFixed(3)}`);
});

console.log(`\ncourt-core-tests: ${passed} checks passed \u2713`);
