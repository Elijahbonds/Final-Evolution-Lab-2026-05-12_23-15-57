// Locomotion — idle, strafes, jump. RE-AUTHORED as pose targets (ship pass 3,
// rung 1): the hands hang where hands hang, in world-axis metres from the root,
// fitted by the two-bone solver; torso and legs in degrees about the parent's
// bind axes. One authoring plays on any body that passes Gate 0.
//
// History: the M24 idle keyed the arms ~8-10° off the T-pose bind, so a standing
// character looked bind-posed; v2 fixed idle and strafe on a measured arms-down
// rest but left jump_up / jump_land on Euler X keys — which on this rig rotate
// the arm about its own axis (a twist), so the arms never swung on a jump
// (measured 2026-09-03 by coreClips.test.ts). Now every clip is a pose.
import type { Scene, Skeleton, AnimationGroup, Bone, Matrix } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

/** Hands hanging at the sides, slightly forward of the hip, palms in — the HERO's measure (shoulder 0.17 out, arm 0.58). */
const HANG_DEFAULT = { Left: [-0.24, 0.84, 0.06] as V3, Right: [0.24, 0.84, 0.06] as V3 };
const HANG_POLES = { Left: [-0.2, -0.3, -0.9] as V3, Right: [0.2, -0.3, -0.9] as V3 };   // elbows slightly back

/**
 * Ship Pass 6 (owner: "fix the arms of the NPCs"): the hang was fixed metres from the root, so a body with shorter arms
 * than the hero (the roster) had to BEND its elbows to reach the same point — arms held out, hands splayed. Now the hang
 * is derived from THIS skeleton: shoulder position from the bind pose, hand a hair under a straight arm's reach.
 */
export function hangFor(sk: Skeleton): { Left: V3; Right: V3 } {
  // REST positions: the bind matrices chained through the parents. (The live absolute matrices carry whatever pose
  // the skeleton is in right now — mid-clip that read the arm short and hung the hands high.)
  const rest = (b: Bone): Matrix => { const p = b.getParent(); return p ? b.getBaseMatrix().multiply(rest(p)) : b.getBaseMatrix().clone(); };
  const pos = (name: string): V3 | null => {
    const b = sk.bones.find((x) => x.name === name); if (!b) return null;
    const t = rest(b).getTranslation(); return [t.x, t.y, t.z];
  };
  const out = { ...HANG_DEFAULT };
  for (const side of ['Left', 'Right'] as const) {
    const sh = pos(`${side}Arm`), el = pos(`${side}ForeArm`), ha = pos(`${side}Hand`);
    if (!sh || !el || !ha) continue;
    const len = Math.hypot(el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]) + Math.hypot(ha[0] - el[0], ha[1] - el[1], ha[2] - el[2]);
    if (!(len > 0.3 && len < 1.2)) continue;
    const dir = side === 'Left' ? -1 : 1;
    out[side] = [sh[0] + dir * 0.05, sh[1] - len * 0.965, sh[2] + 0.06] as V3;   // hands 3.5 % short of straight: a soft elbow
  }
  return out;
}

export function buildIdleStand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const HANG = hangFor(sk);
  const key = (t: number, spine: number, neck: Deg3, lift: number, hipsY: number) => ({
    t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: neck },
    hands: { Left: [HANG.Left[0] - lift * 0.3, HANG.Left[1] + lift, HANG.Left[2]] as V3, Right: [HANG.Right[0] + lift * 0.3, HANG.Right[1] + lift, HANG.Right[2]] as V3 },
    poles: HANG_POLES, hipsY,
  });
  return buildPoseClip(scene, sk, 'idle_stand', 3.0, [key(0, 2, [0, 0, 0], 0, 0), key(1.5, 4.5, [2, 3, 0], 0.02, -0.012), key(3, 2, [0, 0, 0], 0, 0)]);
}

/** The strafe's hips / spine / thigh keys for one phase of the side-step (shared with the sport shuffles — a tennis or
 *  volleyball player side-steps on the same legs with the READY arms, ANIM-READABILITY net / precision 2026-09-07). */
export function strafeBones(dir: 'left' | 'right', roll: number, lead: number, trail: number): Record<string, Deg3> {
  const s = dir === 'left' ? 1 : -1;
  return { Hips: [0, 0, roll * s], Spine: [4 + roll * 0.4, 0, -roll * 0.7 * s], LeftUpLeg: [-12 - lead, 0, 8 * s], RightUpLeg: [-12 + trail, 0, 8 * s] };
}
/** The three phases of the 0.6 s side-step: (t, roll, lead, trail). */
export const STRAFE_PHASES: [number, number, number, number][] = [[0, 6, 0, 0], [0.3, 10, 10, 8], [0.6, 6, 0, 0]];

export function buildStrafe(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const HANG = hangFor(sk);
  const key = (t: number, roll: number, lead: number, trail: number, swing: number) => ({
    t, bones: strafeBones(dir, roll, lead, trail),
    hands: { Left: [HANG.Left[0], HANG.Left[1] + swing, HANG.Left[2] + swing * 2] as V3, Right: [HANG.Right[0], HANG.Right[1] + swing, HANG.Right[2] + swing * 2] as V3 }, poles: HANG_POLES,
  });
  return buildPoseClip(scene, sk, `strafe_${dir}`, 0.6, [key(0, 6, 0, 0, 0.02), key(0.3, 10, 10, 8, 0.05), key(0.6, 6, 0, 0, 0.02)]);
}

export function buildJumpUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'jump_up', 0.45, [
    // gather: deep, arms swung back
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [18, 0, 0], LeftUpLeg: [-45, 0, 6], LeftLeg: [65, 0, 0], RightUpLeg: [-45, 0, -6], RightLeg: [65, 0, 0] }, hands: { Left: [-0.30, 0.95, -0.32], Right: [0.30, 0.95, -0.32] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.18 },
    // take-off: arms thrown overhead
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], LeftUpLeg: [-18, 0, 3], LeftLeg: [18, 0, 0], RightUpLeg: [-18, 0, -3], RightLeg: [18, 0, 0] }, hands: { Left: [-0.18, 1.98, 0.10], Right: [0.18, 1.98, 0.10] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.02 },
    { t: 0.45, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [-25, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-25, 0, -4], RightLeg: [30, 0, 0] }, hands: { Left: [-0.22, 1.90, 0.15], Right: [0.22, 1.90, 0.15] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0 },
  ]);
}

export function buildJumpLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'jump_land', 0.35, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [-25, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-25, 0, -4], RightLeg: [30, 0, 0] }, hands: { Left: [-0.22, 1.90, 0.15], Right: [0.22, 1.90, 0.15] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.02 },
    // absorb: deep crouch, arms come down and forward for balance
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [24, 0, 0], LeftUpLeg: [-55, 0, 8], LeftLeg: [80, 0, 0], RightUpLeg: [-55, 0, -8], RightLeg: [80, 0, 0] }, hands: { Left: [-0.30, 0.95, 0.35], Right: [0.30, 0.95, 0.35] }, hipsY: -0.24 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  LeftUpLeg: [-14, 0, 4], LeftLeg: [18, 0, 0], RightUpLeg: [-14, 0, -4], RightLeg: [18, 0, 0] }, hands: { Left: [-0.26, 0.86, 0.12], Right: [0.26, 0.86, 0.12] }, poles: HANG_POLES, hipsY: 0 },
  ]);
}
