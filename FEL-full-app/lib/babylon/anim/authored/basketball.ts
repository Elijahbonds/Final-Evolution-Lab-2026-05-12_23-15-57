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
  // HOOPS-MOVE-KIT-B (2026-09-08): the post kit — the seal (the path), the fadeaway (M4), the jump hook (M5), the spin (M6)
  'bball_post_up', 'bball_fadeaway', 'bball_hook', 'bball_hook_left', 'bball_spin',
  // HOOPS-MOVE-KIT-B wave 2 (2026-09-08): the footwork — M8 the pump + the step-through, M9 the pivot, M11 the reverse,
  // M13 the hop step, M14 the euro
  'bball_pump_fake', 'bball_step_through', 'bball_pivot', 'bball_layup_reverse', 'bball_layup_reverse_left',
  'bball_hop_step', 'bball_euro_step',
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

/**
 * Block reach: both arms straight overhead. One-shot; the mode owns the jump.
 *
 * THE LEGS ARE KEYED, AND THEY HAVE TO BE (owner, 2026-09-16: "fix the legs when you jump for a block, they shouldn't
 * go in the air"). This clip used to key the Hips, one Spine and the hands and NOTHING ELSE, so the legs kept whatever
 * the clip before it had left them in — and the clip before a block is almost always `bball_defend_slide`, which sits
 * at thighs −28 with the knees at 40. Lift the root off the floor under that pose and the man rises with his knees
 * tucked up in front of him, which is what the owner saw.
 *
 * A contest is the opposite shape: you go up through your toes and the legs hang STRAIGHT and together underneath,
 * because everything you have is going into the hand. So the legs gather at the take-off and then extend and stay
 * extended — the same rule the dunk vocabulary now keeps, for the same reason.
 */
export function buildBlockReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up = { Right: [0.20, 2.00, 0.05] as V3, Left: [-0.20, 2.00, 0.05] as V3 };
  /** The gather: knees bent, feet under you, about to leave the floor. */
  const LOAD: Record<string, Deg3> = { LeftUpLeg: [-26, 0, 5], LeftLeg: [42, 0, 0], RightUpLeg: [-26, 0, -5], RightLeg: [42, 0, 0] };
  /** In the air: long and trailing, toes down. Not mirror-perfect — nobody leaves the floor square. */
  const LONG: Record<string, Deg3> = { LeftUpLeg: [-9, 0, 4], LeftLeg: [11, 0, 0], RightUpLeg: [-3, 0, -4], RightLeg: [16, 0, 0] };
  return buildPoseClip(scene, sk, 'bball_block_reach', 0.5, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [8, 0, 0], ...LOAD },  hands: { Right: [0.25, 1.00, 0.25], Left: mirror([0.25, 1.00, 0.25]) } },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], ...LONG }, hands: up, poles: { Right: UP_R, Left: UP_L } },
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], ...LONG }, hands: { Right: [0.22, 1.98, 0.08], Left: [-0.22, 1.98, 0.08] }, poles: { Right: UP_R, Left: UP_L } },
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

// ── HOOPS-MOVE-KIT-B (2026-09-08): the post kit ────────────────────────────
// SPEC-HOOPS-MOVE-KIT M4–M6. Before this a body with its back to the basket did not exist, a "FADEAWAY" was a label on the
// standing `jumpshot` (no lean, no separation), the game had no hook at all, and a spin had no body. These four are the
// shapes: the seal you hold while you back him down, the lean you leave on, the sweep over the shielding shoulder, and the
// pivot itself. Every one is measured on the shipped rig in basketball.test.ts.

/** The POST-UP seal (the path into M4–M6): a wide low base with the BACK to the basket, the chest tall, the ball held out
 *  and low on the ball side (away from the poke) and the off arm bent BACK into the defender — the seal. Loops with a slow
 *  breath; the mode HOLDS it while the post button is down and drives the back-down with postWish(). */
export function buildPostUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Record<string, Deg3> = { LeftUpLeg: [-26, 0, 20], RightUpLeg: [-26, 0, -20], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] };
  const key = (t: number, spine: number, ball: V3, hipsY: number) => ({
    t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: [-6, 0, 0] as Deg3, ...base },
    hands: { Right: ball, Left: [-0.32, 1.24, -0.24] as V3 },   // the seal arm: elbow high, forearm BACK into his chest
    poles: { Left: [-0.9, 0.0, -0.3] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'bball_post_up', 0.9, [
    key(0, 10, [0.44, 0.92, 0.04], -0.10), key(0.45, 13, [0.46, 0.86, 0.00], -0.13), key(0.9, 10, [0.44, 0.92, 0.04], -0.10),
  ]);
}

/** The FADEAWAY (M4): the gather, the push-off, and then the LEAN — at the release the shoulders are BEHIND the hips and
 *  the legs are kicked out in FRONT (the shape that buys the inch: the mode carries the body away on fadeDrift while this
 *  plays), the ball released high and slightly back over the head, the guide hand at the chest; then the fall and a
 *  balanced landing with the arms down the front. The release is the 0.38 s key, feet-down the 0.8 s key. */
export function buildFadeaway(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_fadeaway', 0.8, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-32, 0, 8], RightUpLeg: [-32, 0, -8], LeftLeg: [46, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [0.16, 1.16, 0.22], Left: [-0.12, 1.14, 0.24] }, hipsY: -0.11 },   // the gather: the ball into both hands, the knees loaded
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-14, 0, 6], RightUpLeg: [-14, 0, -6], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [0.18, 1.62, 0.16], Left: [-0.16, 1.56, 0.20] }, hipsY: 0.02 },   // the push-off: the legs drive, the ball starts up
    // THE LEAN — the shoulders open back over the hips, the thighs come FORWARD (the knees in front of the body): the
    // release goes up from a body already falling away
    { t: 0.38, bones: { Hips: [0, 0, 0], Spine: [-20, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [-44, 0, 6], RightUpLeg: [-44, 0, -6], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.16, 2.06, 0.10], Left: [-0.20, 1.78, 0.18] }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.10 },
    { t: 0.55, bones: { Hips: [0, 0, 0], Spine: [-16, 0, 0], Neck: [8, 0, 0],  LeftUpLeg: [-30, 0, 6], RightUpLeg: [-30, 0, -6], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.20, 1.94, 0.30], Left: [-0.24, 1.50, 0.24] }, poles: { Right: UP_R }, hipsY: 0.05 },   // the follow-through, still falling
    { t: 0.8,  bones: { Hips: [0, 0, 0], Spine: [12, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 8], RightUpLeg: [-26, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.26, 1.16, 0.30], Left: [-0.26, 1.10, 0.28] }, hipsY: -0.09 },   // the landing: absorbed, square, the arms down the front
  ]);
}

/** The JUMP HOOK (M5), right-handed: off the seal the opposite knee drives up as the body turns shoulder-on, the ball
 *  sweeps OUT to the side on a straight arm and goes over the top at full extension — the release is the 0.34 s key — while
 *  the off arm is the SHIELD, out across the body at shoulder height between the ball and the defender. Feet-down at 0.72.
 *  The whole point is where the ball is: high and OUT to the side, not on the midline like a jumper. */
const HOOK_KEYS = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 16], RightUpLeg: [-26, 0, -16], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.42, 0.94, 0.06] as V3, Left: [-0.30, 1.20, -0.10] as V3 }, hipsY: -0.11 },   // the seal, the ball on the hip
  { t: 0.18, bones: { Hips: [0, -10, 0], Spine: [4, -6, 0], Neck: [-6, 8, 0], LeftUpLeg: [-64, 0, 8], RightUpLeg: [-16, 0, -6], LeftLeg: [62, 0, 0], RightLeg: [20, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.64, 1.42, 0.02] as V3, Left: [-0.46, 1.34, 0.14] as V3 }, poles: { Right: [0.95, -0.2, -0.2] as V3 }, hipsY: 0.02 },   // the drive: the opposite knee up, the ball swings out wide
  // THE RELEASE — the arm straight over the top, the ball out on the shooting side well off the midline; the shield arm
  // out across the body at shoulder height (the elbow between him and the ball)
  { t: 0.34, bones: { Hips: [0, -12, 0], Spine: [-2, -8, 0], Neck: [-4, 10, 0], LeftUpLeg: [-72, 0, 8], RightUpLeg: [-10, 0, -6], LeftLeg: [68, 0, 0], RightLeg: [14, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.38, 2.10, 0.06] as V3, Left: [-0.54, 1.42, 0.12] as V3 }, poles: { Right: [0.95, -0.1, -0.2] as V3, Left: [-0.8, -0.4, 0.2] as V3 }, hipsY: 0.07 },
  { t: 0.5,  bones: { Hips: [0, -8, 0], Spine: [2, -4, 0], Neck: [-4, 6, 0], LeftUpLeg: [-40, 0, 10], RightUpLeg: [-18, 0, -8], LeftLeg: [44, 0, 0], RightLeg: [24, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.30, 1.94, 0.22] as V3, Left: [-0.40, 1.30, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.03 },   // over the top, the knee coming down
  { t: 0.72, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [26, 0, 0], RightLeg: [26, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.26, 1.14, 0.30] as V3, Left: [-0.26, 1.10, 0.28] as V3 }, hipsY: -0.05 },   // feet-down, the arms down the front
];
export function buildHook(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_hook', 0.72, HOOK_KEYS);
  return buildPoseClip(scene, sk, 'bball_hook_left', 0.72, HOOK_KEYS.map(mirrorKey));
}

/** The SPIN (M6): the body's shape through the pivot — the mode owns the turn itself (the root's yaw and the arc around
 *  the planted foot); this is what rides it. The ball is pulled TIGHT to the chest in both hands the moment the turn
 *  starts (nothing to poke), the trail knee swings up and across, the chest stays tall through the middle, and the exit
 *  puts the ball back out front in the dribble hand with the body low and driving. 0.6 s — planSpin's own SPIN_SEC. */
export function buildSpin(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_spin', 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0],  Spine: [16, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-30, 0, 10], RightUpLeg: [-30, 0, -10], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.10 },
    { t: 0.16, bones: { Hips: [0, 14, 0], Spine: [12, -8, 0], Neck: [-6, 0, 0], LeftUpLeg: [-24, 0, 10], RightUpLeg: [-58, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [62, 0, 0] }, hands: { Right: [0.14, 1.18, 0.16], Left: [-0.10, 1.20, 0.18] }, hipsY: -0.06 },   // the plant: the ball snapped in to the chest, the trail knee up and across
    { t: 0.34, bones: { Hips: [0, 18, 0], Spine: [8, -10, 0], Neck: [-6, 0, 0], LeftUpLeg: [-18, 0, 8],  RightUpLeg: [-48, 0, -8], LeftLeg: [28, 0, 0], RightLeg: [52, 0, 0] }, hands: { Right: [0.12, 1.22, 0.12], Left: [-0.12, 1.24, 0.14] }, hipsY: -0.02 },   // mid-turn: tall, the ball tight, the swing leg reaching around
    { t: 0.6,  bones: { Hips: [0, 0, 0],  Spine: [18, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-34, 0, 8],  RightUpLeg: [-34, 0, -8], LeftLeg: [48, 0, 0], RightLeg: [48, 0, 0] }, hands: { Right: [0.26, 0.94, 0.34], Left: [-0.24, 1.02, 0.16] }, hipsY: -0.10 },   // the exit: low and driving, the ball back out front
  ]);
}

// ── HOOPS-MOVE-KIT-B wave 2 (2026-09-08): the footwork ─────────────────────
// AMEND-HOOPS-KIT-B-FOOTWORK + -EURO-HOP. Every one of these is a shape the game did not have: a fake that sells (the
// early release was a brick), a step past a shoulder, a turn on a planted foot, a ball laid back on the far side of the
// rim, a two-foot hop, and two steps that go opposite ways.

/** The PUMP FAKE (M8): the ball snaps up to the release height and STOPS — the eyes on the rim, the feet still on the
 *  floor, the knees still loaded (that is the whole tell: no rise) — then it comes back down to the chest. */
export function buildPumpFake(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const load: Record<string, Deg3> = { LeftUpLeg: [-30, 0, 8], RightUpLeg: [-30, 0, -8], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] };
  return buildPoseClip(scene, sk, 'bball_pump_fake', 0.5, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], ...load }, hands: { Right: [0.16, 1.18, 0.24], Left: [-0.12, 1.16, 0.26] }, hipsY: -0.10 },
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-8, 0, 0], ...load }, hands: { Right: [0.18, 1.86, 0.18], Left: [-0.16, 1.78, 0.22] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.09 },   // the ball up to the release — and the FEET STAY DOWN
    { t: 0.28, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-8, 0, 0], ...load }, hands: { Right: [0.18, 1.88, 0.20], Left: [-0.16, 1.80, 0.24] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.09 },   // held there: the sell
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], ...load }, hands: { Right: [0.16, 1.18, 0.24], Left: [-0.12, 1.16, 0.26] }, hipsY: -0.11 },   // back to the chest, still loaded
  ]);
}

/** The STEP-THROUGH (M8): the long step past his shoulder — the lead leg reaches across and forward, the torso turns
 *  through the gap, the ball swept low and away from the arm that was contesting. 0.3 s (the leg the mode walks). */
export function buildStepThrough(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_step_through', 0.3, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [12, 0, 0],   Neck: [-4, 0, 0], LeftUpLeg: [-30, 0, 8], RightUpLeg: [-30, 0, -8], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: [0.16, 1.16, 0.24], Left: [-0.12, 1.14, 0.26] }, hipsY: -0.10 },
    { t: 0.15, bones: { Hips: [0, 16, 0],  Spine: [16, -10, 0], Neck: [-6, 6, 0], LeftUpLeg: [-58, 0, 14], RightUpLeg: [-12, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [0.34, 0.98, 0.30], Left: [-0.06, 1.10, 0.30] }, hipsY: -0.06 },   // the lead leg reaches across, the ball swept low and away
    { t: 0.3,  bones: { Hips: [0, 22, 0],  Spine: [14, -12, 0], Neck: [-6, 8, 0], LeftUpLeg: [-24, 0, 12], RightUpLeg: [-34, 0, -8], LeftLeg: [30, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [0.30, 1.06, 0.34], Left: [-0.10, 1.12, 0.30] }, hipsY: -0.09 },   // through the gap, loaded to finish
  ]);
}

/** The PIVOT (M9): the turn on a planted foot — the ball swept across the body low (protected through the turn), the free
 *  leg stepping around, the chest tall. The mode owns the yaw; this is the shape that rides it. 0.42 s (PIVOT_SEC). */
export function buildPivot(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_pivot', 0.42, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [14, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 10], RightUpLeg: [-26, 0, -10], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
    { t: 0.2,  bones: { Hips: [0, 12, 0],  Spine: [12, -8, 0], Neck: [-6, 0, 0], LeftUpLeg: [-20, 0, 10], RightUpLeg: [-44, 0, -10], LeftLeg: [34, 0, 0], RightLeg: [52, 0, 0] }, hands: { Right: [0.10, 1.02, 0.20], Left: [-0.16, 1.06, 0.20] }, hipsY: -0.06 },   // the ball swept across and in, the free leg stepping round
    { t: 0.42, bones: { Hips: [0, 0, 0],   Spine: [14, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 10], RightUpLeg: [-26, 0, -10], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },   // square again, triple threat
  ]);
}

/** The REVERSE layup (M11), right-handed: carried under the rim, the body turns its BACK to the baseline and the ball is
 *  laid back OVER the head to the far side of the glass — the release is the 0.34 s key, feet-down at 0.74. The tell is
 *  the hand: behind and above the head, not out in front. */
const REVERSE_KEYS = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-8, 0, 0], LeftUpLeg: [-8, 0, 4],  RightUpLeg: [-70, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [72, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.60, 0.02] as V3, Left: [-0.26, 1.36, 0.14] as V3 }, hipsY: 0.02 },   // the knee up, the ball rising behind the ear
  { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-4, 0, 4], RightUpLeg: [-78, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [70, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 2.06, -0.16] as V3, Left: [-0.28, 1.42, 0.10] as V3 }, poles: { Right: [0.85, 0.1, -0.5] as V3 }, hipsY: 0.07 },   // laid BACK: the hand above and BEHIND the head
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-10, 0, 4], RightUpLeg: [-50, 0, -4], LeftLeg: [12, 0, 0], RightLeg: [50, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.94, -0.06] as V3, Left: [-0.26, 1.34, 0.14] as V3 }, poles: { Right: UP_R }, hipsY: 0.04 },
  { t: 0.74, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [26, 0, 0], RightLeg: [26, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.12, 0.28] as V3, Left: [-0.24, 1.08, 0.26] as V3 }, hipsY: -0.05 },
];
export function buildReverseLayup(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_layup_reverse', 0.74, REVERSE_KEYS);
  return buildPoseClip(scene, sk, 'bball_layup_reverse_left', 0.74, REVERSE_KEYS.map(mirrorKey));
}

/** The HOP STEP (M13): off the drive the ball is gathered into BOTH hands as the body hops — both knees come up together,
 *  both feet leave and land TOGETHER (that is the legality: two feet, one gather) into a square, loaded base. 0.26 s. */
export function buildHopStep(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_hop_step', 0.26, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 8], RightUpLeg: [-26, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
    { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-54, 0, 8], RightUpLeg: [-54, 0, -8], LeftLeg: [60, 0, 0], RightLeg: [60, 0, 0] }, hands: { Right: [0.14, 1.14, 0.24], Left: [-0.10, 1.12, 0.26] }, hipsY: 0.06 },   // BOTH knees up together, the ball into both hands: the hop
    { t: 0.26, bones: { Hips: [0, 0, 0], Spine: [18, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-38, 0, 12], RightUpLeg: [-38, 0, -12], LeftLeg: [52, 0, 0], RightLeg: [52, 0, 0] }, hands: { Right: [0.16, 1.20, 0.22], Left: [-0.12, 1.18, 0.24] }, hipsY: -0.13 },   // both feet land TOGETHER, square and loaded
  ]);
}

/** The EURO STEP (M14): two steps that go opposite ways — step A plants wide to one side with the ball swung out over
 *  that hip (the sell), step B crosses hard the other way with the ball snatched across the body. 0.48 s (A + B). */
export function buildEuroStep(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_euro_step', 0.48, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [14, 0, 0],   Neck: [-4, 0, 0], LeftUpLeg: [-28, 0, 8], RightUpLeg: [-28, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
    { t: 0.22, bones: { Hips: [0, -14, 0], Spine: [16, 10, 0],  Neck: [-6, -8, 0], LeftUpLeg: [-20, 0, 8], RightUpLeg: [-52, 0, -18], LeftLeg: [30, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.46, 1.06, 0.22], Left: [0.10, 1.10, 0.26] }, hipsY: -0.05 },   // STEP A: the right leg plants wide, the ball swung out over that hip — the sell
    { t: 0.36, bones: { Hips: [0, 10, 0],  Spine: [16, -8, 0],  Neck: [-6, 6, 0],  LeftUpLeg: [-56, 0, 16], RightUpLeg: [-16, 0, -8], LeftLeg: [52, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [-0.10, 1.04, 0.28], Left: [-0.34, 1.06, 0.26] }, hipsY: -0.04 },   // STEP B: snatched across, the left leg crossing the other way
    { t: 0.48, bones: { Hips: [0, 14, 0],  Spine: [14, -10, 0], Neck: [-6, 8, 0],  LeftUpLeg: [-26, 0, 12], RightUpLeg: [-34, 0, -8], LeftLeg: [36, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [-0.18, 1.08, 0.30], Left: [-0.36, 1.08, 0.24] }, hipsY: -0.09 },   // planted the other side of him, loaded to finish
  ]);
}
