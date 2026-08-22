/**
 * scripts/loco-tests.ts — M14-P2 locomotion blend-tree + stride-sync suite.
 *
 * Proves the invariants of the Phase 2 locomotion remediation (the "kill the
 * penguin walk" pass):
 *   A. BLEND TREE: locomotionBlend() weights are in [0,1], sum to 1, have at
 *      most two non-zero bands, idle weight is monotonically non-increasing and
 *      sprint weight monotonically non-decreasing across the speed sweep;
 *      speed 0 => full idle, speed 1 => full sprint.
 *   B. STRIDE-SYNC: strideSyncTimeScale() rises with ground speed within a band,
 *      stays inside the clamp, and returns 1 for idle; the director's
 *      locomotionClip() playback rate therefore tracks velocity (no fixed
 *      cadence => no foot skate).
 *   C. ROOT-MOTION EXTRACTION: net vs path planar distance, forward sign, and
 *      hasRootMotion behave correctly — including the measured fact that the
 *      hero walk/run clips are authored IN PLACE (no root motion), which is why
 *      stride-sync (not root motion) is the fix for this rig.
 *   D. FSM INTEGRATION: AnimDirectorFSM attaches blend weights to idle/loco
 *      decisions and null while an action overrides; locomotion invariant still
 *      holds; stride-synced speedScale is wired through locomotionClip.
 *
 * Run: yarn tsx scripts/loco-tests.ts
 */
import assert from 'node:assert';
import {
  locomotionBlend,
  dominantBand,
  movementWeight,
  strideSyncTimeScale,
  LOCO_ANCHORS,
  LOCO_REF_SPEED01,
  STRIDE_TS_CLAMP,
  rootMotionNetPlanar,
  rootMotionPathPlanar,
  rootMotionPerFrame,
  rootMotionForwardPositive,
  clipReferenceSpeed,
  hasRootMotion,
  trackDuration,
  type RootTrack,
} from '../lib/loco/locomotion';
import {
  AnimDirectorFSM,
  locomotionClip,
  bandForSpeed,
  locomotionInvariantHolds,
  isValidDecision,
} from '../lib/anim/state-machine';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const EPS = 1e-9;
const sweep = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i / n);

// ------------------------------------------------------------- A. blend tree
check('blend weights are in [0,1] and sum to 1 across the whole speed sweep', () => {
  for (const s of sweep(200)) {
    const w = locomotionBlend(s);
    for (const k of ['idle', 'walk', 'run', 'sprint'] as const) {
      assert.ok(w[k] >= -EPS && w[k] <= 1 + EPS, `weight ${k} out of range at s=${s}: ${w[k]}`);
    }
    const sum = w.idle + w.walk + w.run + w.sprint;
    assert.ok(Math.abs(sum - 1) < 1e-6, `weights must sum to 1 at s=${s}, got ${sum}`);
  }
});

check('at most two bands are non-zero at once (adjacent crossfade)', () => {
  for (const s of sweep(200)) {
    const w = locomotionBlend(s);
    const nz = [w.idle, w.walk, w.run, w.sprint].filter((v) => v > 1e-6).length;
    assert.ok(nz <= 2, `more than two non-zero bands at s=${s} (${nz})`);
  }
});

check('speed 0 => full idle, speed 1 => full sprint', () => {
  const lo = locomotionBlend(0);
  assert.ok(Math.abs(lo.idle - 1) < EPS, `s=0 must be full idle, got ${lo.idle}`);
  const hi = locomotionBlend(1);
  assert.ok(Math.abs(hi.sprint - 1) < EPS, `s=1 must be full sprint, got ${hi.sprint}`);
});

check('idle weight is non-increasing and sprint weight non-decreasing in speed', () => {
  let prevIdle = Infinity;
  let prevSprint = -Infinity;
  for (const s of sweep(200)) {
    const w = locomotionBlend(s);
    assert.ok(w.idle <= prevIdle + 1e-6, `idle weight rose at s=${s}`);
    assert.ok(w.sprint >= prevSprint - 1e-6, `sprint weight fell at s=${s}`);
    prevIdle = w.idle;
    prevSprint = w.sprint;
  }
});

check('dominantBand / movementWeight track the blend', () => {
  assert.strictEqual(dominantBand(locomotionBlend(0)), 'idle');
  assert.strictEqual(dominantBand(locomotionBlend(1)), 'sprint');
  assert.ok(movementWeight(locomotionBlend(0)) < 1e-6, 'movementWeight at rest must be ~0');
  assert.ok(movementWeight(locomotionBlend(1)) > 1 - 1e-6, 'movementWeight at full speed must be ~1');
  // At the walk anchor the walk band dominates.
  assert.strictEqual(dominantBand(locomotionBlend(LOCO_ANCHORS.walk)), 'walk');
});

// ------------------------------------------------------------ B. stride-sync
check('strideSyncTimeScale returns 1 for idle', () => {
  assert.strictEqual(strideSyncTimeScale(0, 'idle'), 1);
  assert.strictEqual(strideSyncTimeScale(0.5, 'idle'), 1);
});

check('stride-sync playback rate rises with ground speed within a band', () => {
  for (const band of ['walk', 'run', 'sprint'] as const) {
    let prev = -Infinity;
    for (const s of sweep(50)) {
      const ts = strideSyncTimeScale(s, band);
      assert.ok(ts >= STRIDE_TS_CLAMP.min - EPS && ts <= STRIDE_TS_CLAMP.max + EPS, `ts out of clamp for ${band} at s=${s}: ${ts}`);
      assert.ok(ts >= prev - EPS, `ts must be non-decreasing in speed for ${band} at s=${s}`);
      prev = ts;
    }
  }
});

check('stride-sync is ~1 at each band reference speed (planted cadence)', () => {
  for (const band of ['walk', 'run', 'sprint'] as const) {
    const ts = strideSyncTimeScale(LOCO_REF_SPEED01[band], band);
    assert.ok(Math.abs(ts - 1) < 1e-6, `ts at reference speed for ${band} must be ~1, got ${ts}`);
  }
});

check('slow walk steps slower than fast walk (the anti-skate property)', () => {
  const slow = strideSyncTimeScale(0.06, 'walk');
  const fast = strideSyncTimeScale(0.34, 'walk');
  assert.ok(fast > slow, `fast walk cadence (${fast}) must exceed slow walk cadence (${slow})`);
});

check('locomotionClip wires stride-synced speedScale (not the old fixed formula)', () => {
  const walkSlow = locomotionClip('walk', 0.06);
  const walkFast = locomotionClip('walk', 0.34);
  assert.ok(walkSlow.speedScale === strideSyncTimeScale(0.06, 'walk'));
  assert.ok(walkFast.speedScale > walkSlow.speedScale, 'faster walk must play faster');
  assert.strictEqual(locomotionClip('idle', 0).speedScale, 1);
});

// ---------------------------------------------------- C. root-motion helpers
function forwardTrack(steps: number, perStep: number, fps = 30): RootTrack {
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    times.push(i / fps);
    values.push(0, 1, -i * perStep); // forward is -Z; constant Y height
  }
  return { times, values };
}
function inPlaceTrack(steps: number, fps = 30): RootTrack {
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    times.push(i / fps);
    values.push(0.07, 92.76, -0.01); // the measured hero Hips resting offset
  }
  return { times, values };
}

check('root motion: forward track has positive forward net + path=net', () => {
  const tr = forwardTrack(10, 0.1);
  const net = rootMotionNetPlanar(tr);
  assert.ok(net.dist > 0.9 && net.dist < 1.1, `net planar ~1.0, got ${net.dist}`);
  assert.ok(Math.abs(rootMotionPathPlanar(tr) - net.dist) < 1e-6, 'monotonic path == net');
  assert.ok(rootMotionForwardPositive(tr, 'z'), 'forward (-Z) must read as forward-positive');
  assert.ok(hasRootMotion(tr), 'forward track must report root motion');
});

check('root motion: per-frame deltas are uniform and sum to net', () => {
  const tr = forwardTrack(10, 0.1);
  const pf = rootMotionPerFrame(tr);
  assert.strictEqual(pf.length, tr.times.length);
  assert.ok(pf[0].dx === 0 && pf[0].dz === 0, 'frame 0 delta must be zero');
  const sumZ = pf.reduce((s, d) => s + d.dz, 0);
  assert.ok(Math.abs(sumZ - (-1.0)) < 1e-6, `per-frame dz must sum to net (-1.0), got ${sumZ}`);
});

check('root motion: in-place (hero) track reports ZERO motion => stride-sync path', () => {
  const tr = inPlaceTrack(30);
  assert.ok(!hasRootMotion(tr), 'hero-style in-place clip must report no root motion');
  assert.strictEqual(rootMotionNetPlanar(tr).dist, 0);
  assert.strictEqual(clipReferenceSpeed(tr), 0, 'in-place clip has zero native ground speed');
  assert.ok(!rootMotionForwardPositive(tr), 'in-place clip is not forward-positive');
});

check('root motion: clipReferenceSpeed = path/duration for a moving clip', () => {
  const tr = forwardTrack(30, 0.1, 30); // 3.0 units over 1.0s => 3.0 u/s
  assert.ok(Math.abs(trackDuration(tr) - 1.0) < 1e-6, 'duration must be 1s');
  assert.ok(Math.abs(clipReferenceSpeed(tr) - 3.0) < 1e-6, `native speed ~3.0, got ${clipReferenceSpeed(tr)}`);
});

// ----------------------------------------------------------- D. FSM wiring
check('FSM attaches blend weights to idle + locomotion, null under action', () => {
  const fsm = new AnimDirectorFSM();
  fsm.reset();
  const idle = fsm.update(1 / 60, { modeId: 'venice_pickup', speed01: 0 });
  assert.ok(idle.kind === 'idle' && idle.blend != null, 'idle decision must carry blend weights');
  assert.ok(Math.abs(idle.blend!.idle - 1) < EPS, 'idle blend must be full idle at rest');
  const move = fsm.update(1 / 60, { modeId: 'venice_pickup', speed01: 0.5 });
  assert.ok(move.kind === 'locomotion' && move.blend != null, 'loco decision must carry blend weights');
  const act = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0.5, actionEvent: 'kick' });
  assert.ok(act.kind === 'action' && act.blend === null, 'action decision must have null blend');
});

check('locomotion invariant still holds and decisions never T-pose', () => {
  const fsm = new AnimDirectorFSM();
  fsm.reset();
  for (const s of sweep(40)) {
    const d = fsm.update(1 / 60, { modeId: 'soccer', speed01: s });
    assert.ok(isValidDecision(d), `decision must be valid at s=${s}`);
    assert.ok(locomotionInvariantHolds(s, d), `loco invariant broken at s=${s}`);
  }
});

check('bandForSpeed and blend agree at the extremes', () => {
  assert.strictEqual(bandForSpeed(0), 'idle');
  assert.strictEqual(bandForSpeed(1), 'sprint');
  assert.strictEqual(dominantBand(locomotionBlend(0)), bandForSpeed(0));
});

console.log(`\n\u2705 loco-tests: ${passed} checks passed`);
