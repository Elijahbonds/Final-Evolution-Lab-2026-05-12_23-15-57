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
  'bball_follow_through',   // BIOMECH-HOOPS-WAVE1 (2026-09-08): the shot's follow-through, held until the arc resolves (G5)
  // HOOPS-MOVE-KIT-A (2026-09-08): the player's pull-up gather (M1), the left-hand layup + the floater (M3)
  'bball_pullup_gather', 'bball_layup_gather_left', 'bball_floater',
  'bball_hand_up',   // HOOPS-MOVE-KIT-A D3: the grounded hand-up contest (a held loop)
  'bball_screen_set',   // HOOPS-MOVE-KIT-A O1: the planted screen (a held loop)
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

/** Mirror a pose key across the body's midline: hands / poles / feet x negated and the sides swapped, the left and right
 *  leg bones swapped, the torso's yaw / roll negated. (The keys authored here are pitch-only in the torso.) */
function mirrorKey(k: { t: number; bones?: Record<string, Deg3>; hands?: { Left?: V3; Right?: V3 }; poles?: { Left?: V3; Right?: V3 }; hipsY?: number }): typeof k {
  const swapSide = (n: string) => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;
  const bones: Record<string, Deg3> | undefined = k.bones && Object.fromEntries(Object.entries(k.bones).map(([n, [x, y, z]]) => [swapSide(n), [x, -y, -z] as Deg3]));
  const flip = (h?: { Left?: V3; Right?: V3 }) => h && { Left: h.Right && mirror(h.Right), Right: h.Left && mirror(h.Left) };
  return { t: k.t, bones, hands: flip(k.hands), poles: flip(k.poles), hipsY: k.hipsY };
}

/** The right-hand layup: the inside (right) knee drives up as the ball hand rises to the top, the finish extends toward the
 *  glass with the off arm shielding, then the feet come down the FRONT to a soft stance (HOOPS-MOVE-KIT-A M3: the finish
 *  used to be the dunk launch clip — a two-arm sweep through a T). The release is the 0.3 s key; the modes pace the clip so
 *  it lands on the meter's green and ride the hop to the 0.7 s landing key. */
const LAYUP_KEYS = [
  { t: 0,   bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], LeftUpLeg: [4, 0, 4],   RightUpLeg: [-82, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [78, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.20, 1.95, 0.15] as V3, Left: [-0.30, 1.25, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.02 },
  { t: 0.5, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [8, 0, 4],   RightUpLeg: [-70, 0, -4], LeftLeg: [4, 0, 0],  RightLeg: [60, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.98, 0.10] as V3, Left: [-0.30, 1.20, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.05 },
  // feet-down: the legs under the body, the ball arm comes down the front, the off hand to the hip
  { t: 0.7, bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  LeftUpLeg: [-16, 0, 6], RightUpLeg: [-16, 0, -6], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.12, 0.30] as V3, Left: [-0.24, 1.08, 0.28] as V3 }, hipsY: -0.04 },
];
export function buildLayupGather(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_layup_gather', 0.7, LAYUP_KEYS);
  return buildPoseClip(scene, sk, 'bball_layup_gather_left', 0.7, LAYUP_KEYS.map(mirrorKey));
}

/** The pull-up GATHER (HOOPS-MOVE-KIT-A M1): off the live dribble the ball comes into both hands at the hip as the knees
 *  load (the plant — the modes bleed the body's speed over this clip), then up to the chest, set: the jumpshot's rise takes
 *  it from there. 0.3 s, paced by the mode to the gather's own seconds; the last frame is HELD until the rise. */
export function buildPullupGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_pullup_gather', 0.3, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [0, 0, 0],  ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.14, bones: { Hips: [0, 0, 0], Spine: [20, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-34, 0, 8], RightUpLeg: [-34, 0, -8], LeftLeg: [48, 0, 0], RightLeg: [48, 0, 0] }, hands: { Right: [0.22, 0.92, 0.28], Left: [0.02, 0.90, 0.30] }, hipsY: -0.12 },   // both hands on the ball at the hip, the knees loaded
    { t: 0.3,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-30, 0, 8], RightUpLeg: [-30, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: [0.14, 1.28, 0.26], Left: [-0.10, 1.26, 0.28] }, hipsY: -0.10 },   // set: the ball at the chest, ready to rise
  ]);
}

/** The FLOATER (HOOPS-MOVE-KIT-A M3): a runner off the stride — the knee comes up, the ball to the chest, then a one-hand
 *  push from the forehead, the arm high and in front, the off hand at the chest; the legs come down under the body. The
 *  release is the 0.35 s key (the top of the hop); the modes pace it to the meter and hold the 0.7 s landing key. */
export function buildFloater(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_floater', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [0, 0, 0],  LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-6, 0, 4],  RightUpLeg: [-50, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.12, 1.32, 0.30], Left: [-0.14, 1.28, 0.30] }, hipsY: 0 },   // the gather off the stride, the ball to the chest
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-2, 0, 4],  RightUpLeg: [-72, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [70, 0, 0] }, hands: { Right: [0.12, 2.05, 0.30], Left: [-0.25, 1.35, 0.20] }, poles: { Right: UP_R }, hipsY: 0.04 },   // the push: the ball arm high and in front, the runner's knee up (measured: −56° lifted the knee 0.21 m, −82° 0.42)
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-12, 0, 4], RightUpLeg: [-30, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: [0.16, 1.90, 0.35], Left: [-0.24, 1.30, 0.22] }, poles: { Right: UP_R }, hipsY: 0.02 },   // the follow: the arm stays up, the knee comes down
    { t: 0.7,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-16, 0, 6], RightUpLeg: [-16, 0, -6], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] }, hands: { Right: [0.24, 1.12, 0.30], Left: [-0.24, 1.08, 0.28] }, hipsY: -0.04 },   // feet-down, the arm down the front
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

/** The shot's FOLLOW-THROUGH (BIOMECH-HOOPS-WAVE1, G5 end pose): played from the jumpshot's release frame (both arms
 *  overhead — the first key matches it, so the crossfade is a continuation, not a swap), the shooting wrist snaps down and
 *  forward while the arm stays up, the off hand drops to the chest, then both come down the FRONT to a soft-knee stance
 *  (never out to the sides: the dunk's land clips proved a wide descent blends through a T). One-shot; the tree settles it. */
export function buildFollowThrough(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const soft: Record<string, Deg3> = { LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] };
  return buildPoseClip(scene, sk, 'bball_follow_through', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] }, hands: { Right: [0.18, 2.02, 0.22], Left: [-0.16, 1.92, 0.24] }, poles: { Right: UP_R, Left: UP_L } },
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] }, hands: { Right: [0.22, 1.90, 0.46], Left: [-0.22, 1.55, 0.32] }, poles: { Right: UP_R, Left: UP_L } },   // the wrist snap: the ball hand forward, the arm still up; the off hand drops
    { t: 0.4,  bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-6, 0, 0], ...soft }, hands: { Right: [0.24, 1.72, 0.44], Left: [-0.24, 1.30, 0.30] }, poles: { Right: UP_R, Left: [-0.7, -0.2, -0.5] }, hipsY: -0.02 },
    { t: 0.7,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], ...soft }, hands: { Right: [0.26, 1.18, 0.34], Left: [-0.26, 1.12, 0.30] }, hipsY: -0.04 },   // down the front to a ready stance
  ]);
}

/** The grounded HAND-UP contest (HOOPS-MOVE-KIT-A D3): the near arm straight up, the off arm out low in front, a wide low
 *  stance on the floor — verticality, no jump. Loops with a small sway; the mode HOLDS it while the contest button is held. */
export function buildHandUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const stance: Record<string, Deg3> = { LeftUpLeg: [-26, 0, 20], RightUpLeg: [-26, 0, -20], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] };
  const key = (t: number, hand: V3, sway: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [6, 0, sway] as Deg3, Neck: [-6, 0, 0] as Deg3, ...stance }, hands: { Right: hand, Left: [-0.36, 1.02, 0.30] as V3 }, poles: { Right: UP_R }, hipsY: -0.09 });
  return buildPoseClip(scene, sk, 'bball_hand_up', 0.7, [key(0, [0.18, 2.02, 0.10], 0), key(0.35, [0.21, 2.0, 0.14], 2), key(0.7, [0.18, 2.02, 0.10], 0)]);
}

/** The SCREEN (HOOPS-MOVE-KIT-A O1): a wide, low, planted base, the chest tall, both hands crossed low in front of the
 *  hips (the arms in, nothing to call) — held while the screen is set; a slow breath so it never reads frozen. */
export function buildScreenSet(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Record<string, Deg3> = { LeftUpLeg: [-24, 0, 22], RightUpLeg: [-24, 0, -22], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] };
  const key = (t: number, spine: number, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: [-4, 0, 0] as Deg3, ...base }, hands: { Right: [0.06, 0.86, 0.24] as V3, Left: [-0.06, 0.88, 0.22] as V3 }, hipsY });
  return buildPoseClip(scene, sk, 'bball_screen_set', 0.9, [key(0, 4, -0.08), key(0.45, 7, -0.10), key(0.9, 4, -0.08)]);
}

/** Steal reach: the lead hand flashes forward and low, the torso follows. */
export function buildStealReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_steal_reach', 0.35, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [16, 0, 0],   ...STANCE }, hands: { Right: [0.25, 1.00, 0.25], Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [26, 12, 0],  LeftUpLeg: [-30, 0, 10], RightUpLeg: [-14, 0, -8], LeftLeg: [38, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [0.28, 0.92, 0.62], Left: OFF_HAND }, poles: { Right: [0.8, -0.6, 0.0] }, hipsY: -0.08 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [16, 0, 0],   ...STANCE }, hands: { Right: [0.25, 1.00, 0.25], Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}
