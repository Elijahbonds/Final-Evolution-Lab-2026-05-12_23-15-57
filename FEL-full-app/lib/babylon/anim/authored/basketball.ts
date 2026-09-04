// Basketball packages (Phase 4, 2026-09-03) — the moves the 2K benchmark
// expects to SEE: a live dribble, size-ups (crossover / hesi), the layup
// gather, a defensive slide, a block reach and a steal reach.
//
// RE-AUTHORED as pose targets (ship pass 3, rung 1): torso and legs in degrees
// about the parent's bind axes, hands as world-axis metres from the root
// (+x = the hero's right at bind), fitted at build time by the two-bone solver
// so one authoring plays on any body that passes Gate 0. Every clip is proven
// by basketball.test.ts on the shipped hero and the candidate body.
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD (+z).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const BASKETBALL_CLIPS = [
  'bball_dribble_idle', 'bball_crossover_left', 'bball_crossover_right', 'bball_hesi',
  'bball_layup_gather', 'bball_defend_slide_left', 'bball_defend_slide_right',
  'bball_block_reach', 'bball_steal_reach',
] as const;
type V3 = [number, number, number];

const STANCE: Record<string, Deg3> = { LeftUpLeg: [-22, 0, 8], RightUpLeg: [-22, 0, -8], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] };
const BALL_HAND: V3 = [0.25, 0.95, 0.30];       // the live dribble, waist height, out front
const OFF_HAND: V3 = [-0.25, 1.00, 0.12];       // relaxed, slightly forward
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];
const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];

/** Ball-hand pump on a bent-knee stance. Loops. */
export function buildDribbleIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const key = (t: number, spine: number, hand: V3, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...STANCE }, hands: { Right: hand, Left: OFF_HAND }, hipsY });
  return buildPoseClip(scene, sk, 'bball_dribble_idle', 0.8, [key(0, 14, BALL_HAND, -0.05), key(0.4, 17, [0.22, 0.82, 0.32], -0.07), key(0.8, 14, BALL_HAND, -0.05)]);
}

/** Crossover: hips and shoulders snap to the new side, the ball hand sweeps across. */
export function buildCrossover(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  // going left: the right hand carries the ball across to the left hip; going right: the left hand comes across
  const across = { Right: (dir === 'left' ? [-0.12, 0.88, 0.34] : [0.48, 0.95, 0.26]) as V3, Left: (dir === 'left' ? [-0.48, 0.95, 0.26] : [0.12, 0.88, 0.34]) as V3 };
  return buildPoseClip(scene, sk, `bball_crossover_${dir}`, 0.45, [
    { t: 0,    bones: { Hips: [0, 0, 0],      Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.2,  bones: { Hips: [0, 28 * s, 0], Spine: [20, -14 * s, 0], LeftUpLeg: [-34, 0, 18], RightUpLeg: [-34, 0, -18], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: across, hipsY: -0.09 },
    { t: 0.45, bones: { Hips: [0, 6 * s, 0],  Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}

/** Hesitation: a stutter — the body checks, the ball hand holds, the knees load. */
export function buildHesi(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_hesi', 0.55, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [0, 0, 0],  ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-8, 0, 0], LeftUpLeg: [-10, 0, 8], RightUpLeg: [-10, 0, -8], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.26, 0.98, 0.31], Left: OFF_HAND }, hipsY: -0.02 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-14, 0, 8], RightUpLeg: [-14, 0, -8], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [0.26, 0.96, 0.31], Left: OFF_HAND }, hipsY: -0.04 },
    { t: 0.55, bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [0, 0, 0],  LeftUpLeg: [-28, 0, 8], RightUpLeg: [-28, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
  ]);
}

/** Layup gather: the inside knee drives up as the ball hand rises. */
export function buildLayupGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_layup_gather', 0.5, [
    { t: 0,   bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], LeftUpLeg: [4, 0, 4],   RightUpLeg: [-82, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [78, 0, 0] }, hands: { Right: [0.20, 1.95, 0.15], Left: [-0.30, 1.25, 0.20] }, poles: { Right: UP_R }, hipsY: 0.02 },
    { t: 0.5, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [8, 0, 4],   RightUpLeg: [-70, 0, -4], LeftLeg: [4, 0, 0],  RightLeg: [60, 0, 0] }, hands: { Right: [0.18, 1.98, 0.10], Left: [-0.30, 1.20, 0.20] }, poles: { Right: UP_R }, hipsY: 0.05 },
  ]);
}

/** Defensive slide: wide, low, arms out and low in front. Loops. */
export function buildDefendSlide(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const hands = { Left: [-0.36, 1.05, 0.30] as V3, Right: [0.36, 1.05, 0.30] as V3 };
  const key = (t: number, roll: number, lead: Deg3, trail: Deg3, hipsY: number) => ({ t, bones: { Hips: [0, 0, roll * s] as Deg3, Spine: [22, 0, -4 * s] as Deg3, LeftUpLeg: lead, RightUpLeg: trail, LeftLeg: [40, 0, 0] as Deg3, RightLeg: [40, 0, 0] as Deg3 }, hands, hipsY });
  return buildPoseClip(scene, sk, `bball_defend_slide_${dir}`, 0.5, [
    key(0, 4, [-28, 0, 22], [-28, 0, -22], -0.10), key(0.25, 8, [-34, 0, 30], [-22, 0, -14], -0.12), key(0.5, 4, [-28, 0, 22], [-28, 0, -22], -0.10),
  ]);
}

/** Block reach: both arms straight overhead. One-shot; the mode owns the jump. */
export function buildBlockReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up = { Right: [0.20, 2.00, 0.05] as V3, Left: [-0.20, 2.00, 0.05] as V3 };
  return buildPoseClip(scene, sk, 'bball_block_reach', 0.5, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [8, 0, 0] },  hands: { Right: [0.25, 1.00, 0.25], Left: mirror([0.25, 1.00, 0.25]) } },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0] }, hands: up, poles: { Right: UP_R, Left: UP_L } },
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0] }, hands: { Right: [0.22, 1.98, 0.08], Left: [-0.22, 1.98, 0.08] }, poles: { Right: UP_R, Left: UP_L } },
  ]);
}

/** Steal reach: the lead hand flashes forward and low, the torso follows. */
export function buildStealReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_steal_reach', 0.35, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [16, 0, 0],   ...STANCE }, hands: { Right: [0.25, 1.00, 0.25], Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [26, 12, 0],  LeftUpLeg: [-30, 0, 10], RightUpLeg: [-14, 0, -8], LeftLeg: [38, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [0.28, 0.92, 0.62], Left: OFF_HAND }, poles: { Right: [0.8, -0.6, 0.0] }, hipsY: -0.08 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [16, 0, 0],   ...STANCE }, hands: { Right: [0.25, 1.00, 0.25], Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}
