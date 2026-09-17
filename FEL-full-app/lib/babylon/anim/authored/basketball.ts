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
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';

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
  'bball_mikan', 'bball_mikan_left', 'bball_up_and_under', 'bball_up_and_under_left',
  'bball_finger_roll', 'bball_finger_roll_left', 'bball_floater_left', 'bball_euro_step_left',
  'bball_in_and_out_left', 'bball_in_and_out_right', 'bball_between_legs_left', 'bball_between_legs_right',
  'bball_behind_back_left', 'bball_behind_back_right', 'bball_double_cross_left', 'bball_double_cross_right',
  'bball_snatch_back', 'bball_shammgod_left', 'bball_shammgod_right', 'bball_yoyo',
  'bball_ankle_stumble', 'bball_ankle_slip',
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
// THE RUNNER, either hand (2026-09-16). The shape was always right; what it did not have was a LEFT, and
// FINISH_CLIP.floater pointed both sides at this one clip — so a floater taken going left pushed the ball up with
// the right hand, across the body, in front of the help it was supposed to be getting over.
const FLOATER_KEYS: PoseKey[] = [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [0, 0, 0],  LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-6, 0, 4],  RightUpLeg: [-50, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.12, 1.32, 0.30], Left: [-0.14, 1.28, 0.30] }, hipsY: 0 },   // the gather off the stride, the ball to the chest
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-2, 0, 4],  RightUpLeg: [-72, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [70, 0, 0] }, hands: { Right: [0.12, 2.05, 0.30], Left: [-0.25, 1.35, 0.20] }, poles: { Right: UP_R }, hipsY: 0.04 },   // the push: the ball arm high and in front, the runner's knee up (measured: −56° lifted the knee 0.21 m, −82° 0.42)
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-12, 0, 4], RightUpLeg: [-30, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: [0.16, 1.90, 0.35], Left: [-0.24, 1.30, 0.22] }, poles: { Right: UP_R }, hipsY: 0.02 },   // the follow: the arm stays up, the knee comes down
    { t: 0.7,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-16, 0, 6], RightUpLeg: [-16, 0, -6], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] }, hands: { Right: [0.24, 1.12, 0.30], Left: [-0.24, 1.08, 0.28] }, hipsY: -0.04 },   // feet-down, the arm down the front
];
export function buildFloater(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_floater', 0.7, FLOATER_KEYS);
  return buildPoseClip(scene, sk, 'bball_floater_left', 0.7, FLOATER_KEYS.map(mirrorKey));
}

// ── THE HANDLE (owner, 2026-09-16: "add more dribble moves and crossovers", "ankle breakers") ────────────────
//
// HandleSystem has TWELVE moves in it, gated by a handle rating, each with its own odds, chain and banner — and the
// animation tree had one crossover state hardwired to `bball_crossover_left`. So a between-the-legs, a behind-the-
// back, an in-and-out, a yoyo, a double cross, a snatch back and a shammgod all resolved, called themselves out on
// the HUD, and played a left crossover; a crossover going RIGHT played the left clip too. The moves were real and
// the body was not doing any of them.
//
// Each of these keys the same three things the crossover does — where the ball is, which way the hips turn, how
// low the stance gets — because at dribble distance that is the entire read a defender has.

/** IN AND OUT: the ball is pushed out as if it is going across, and the SAME hand snatches it back. The tell is
 *  that the off hand never moves — a crossover that keeps its hand. */
export function buildInAndOut(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const out: V3 = [0.42 * -s, 0.90, 0.36], back: V3 = [0.28 * -s, 0.86, 0.30];
  return buildPoseClip(scene, sk, `bball_in_and_out_${dir}`, 0.42, [
    { t: 0,    bones: { Hips: [0, 0, 0],      Spine: [14, 0, 0],      ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.16, bones: { Hips: [0, 16 * s, 0], Spine: [20, -8 * s, 0], LeftUpLeg: [-32, 0, 16], RightUpLeg: [-32, 0, -16], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: out, Left: OFF_HAND }, hipsY: -0.09 },   // the lie: the ball goes out that way
    { t: 0.28, bones: { Hips: [0, -8 * s, 0], Spine: [18, 4 * s, 0],  LeftUpLeg: [-30, 0, 14], RightUpLeg: [-30, 0, -14], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: back, Left: OFF_HAND }, hipsY: -0.08 },   // …and the SAME hand takes it back
    { t: 0.42, bones: { Hips: [0, 0, 0],      Spine: [14, 0, 0],      ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}

/** BETWEEN THE LEGS: the ball goes under the bridge, hand to hand, and the knees have to make room for it — the
 *  stance drops lower here than any other move on the list, which is what sells it from the front. */
export function buildBetweenLegsDribble(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  return buildPoseClip(scene, sk, `bball_between_legs_${dir}`, 0.48, [
    { t: 0,    bones: { Hips: [0, 0, 0],      Spine: [14, 0, 0],      ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, 10 * s, 0], Spine: [44, -6 * s, 0], LeftUpLeg: [-72, 0, 30], RightUpLeg: [-72, 0, -30], LeftLeg: [86, 0, 0], RightLeg: [86, 0, 0] }, hands: { Right: [0.10 * -s, 0.26, 0.30] as V3, Left: [-0.30 * s, 0.88, 0.16] as V3 }, hipsY: -0.30 },   // UNDER: measured — at 0.52 the ball was still ABOVE the knee line (knee y 0.51), which is a low crossover, not a between-the-legs
    { t: 0.3,  bones: { Hips: [0, -6 * s, 0], Spine: [24, 4 * s, 0],  LeftUpLeg: [-40, 0, 22], RightUpLeg: [-40, 0, -22], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [-0.34 * s, 0.86, 0.26] as V3, Left: [0.16 * s, 0.70, 0.28] as V3 }, hipsY: -0.12 },   // caught on the other side
    { t: 0.48, bones: { Hips: [0, 0, 0],      Spine: [14, 0, 0],      ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}

/** BEHIND THE BACK: the ball is wrapped round the hip, and the giveaway is the SHOULDER — it turns away from the
 *  defender to make the room, which is the opposite of every other move here. */
export function buildBehindBackDribble(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  return buildPoseClip(scene, sk, `bball_behind_back_${dir}`, 0.46, [
    { t: 0,    bones: { Hips: [0, 0, 0],       Spine: [14, 0, 0],        ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, -22 * s, 0], Spine: [18, 16 * s, 0],   LeftUpLeg: [-34, 0, 16], RightUpLeg: [-34, 0, -16], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: [0.30 * -s, 0.82, -0.26] as V3, Left: OFF_HAND }, hipsY: -0.09 },   // BEHIND: the ball off the hip, the shoulder turned away
    { t: 0.32, bones: { Hips: [0, 14 * s, 0],  Spine: [16, -10 * s, 0],  LeftUpLeg: [-32, 0, 16], RightUpLeg: [-32, 0, -16], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.10 * s, 0.86, 0.20] as V3, Left: [0.34 * s, 0.88, 0.22] as V3 }, hipsY: -0.08 },   // and out the far side into the other hand
    { t: 0.46, bones: { Hips: [0, 0, 0],       Spine: [14, 0, 0],        ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}

/** DOUBLE CROSS: two crossovers on one beat. The second is the one that gets him, so it is the harder, lower one —
 *  and the hips have to come back through the middle in between, which is the half-beat the defender has to read. */
export function buildDoubleCross(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const l: V3 = [-0.46, 0.92, 0.28], r: V3 = [0.46, 0.92, 0.28];
  return buildPoseClip(scene, sk, `bball_double_cross_${dir}`, 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0],       Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.16, bones: { Hips: [0, 24 * s, 0],  Spine: [20, -12 * s, 0], LeftUpLeg: [-32, 0, 16], RightUpLeg: [-32, 0, -16], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: s > 0 ? l : r, Left: s > 0 ? r : l }, hipsY: -0.09 },   // one
    { t: 0.3,  bones: { Hips: [0, -10 * s, 0], Spine: [18, 6 * s, 0],   LeftUpLeg: [-34, 0, 16], RightUpLeg: [-34, 0, -16], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: s > 0 ? r : l, Left: s > 0 ? l : r }, hipsY: -0.10 },   // back through the middle — the half-beat
    { t: 0.44, bones: { Hips: [0, 32 * s, 0],  Spine: [24, -18 * s, 0], LeftUpLeg: [-40, 0, 20], RightUpLeg: [-40, 0, -20], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: s > 0 ? l : r, Left: s > 0 ? r : l }, hipsY: -0.14 },   // TWO: lower, harder, and gone
    { t: 0.6,  bones: { Hips: [0, 8 * s, 0],   Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  ]);
}

/** SNATCH BACK: you drive AT him, plant, and rip the ball back to where you came from. The body goes backwards
 *  while the chest stays square — that is what makes it a shot, not a retreat. */
export function buildSnatchBack(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_snatch_back', 0.5, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [-4, 0, 0], ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.14, bones: { Hips: [0, 0, 0], Spine: [26, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-44, 0, 10], RightUpLeg: [-20, 0, -10], LeftLeg: [54, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: [0.30, 0.78, 0.46] as V3, Left: OFF_HAND }, hipsY: -0.13 },   // INTO him: the ball pushed out front, the weight forward
    { t: 0.3,  bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [0, 0, 0],  LeftUpLeg: [-6, 0, 12], RightUpLeg: [-6, 0, -12], LeftLeg: [12, 0, 0], RightLeg: [12, 0, 0] }, hands: { Right: [0.24, 1.02, -0.06] as V3, Left: [-0.22, 1.02, -0.02] as V3 }, hipsY: 0.01 },   // RIPPED back — the ball behind the hip line, the chest still on him
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-2, 0, 0], LeftUpLeg: [-26, 0, 10], RightUpLeg: [-26, 0, -10], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: [0.26, 0.96, 0.18] as V3, Left: OFF_HAND }, hipsY: -0.07 },   // planted, loaded, in front of nobody
  ]);
}

/** THE SHAMMGOD: the ball is PUSHED away with one hand and pulled back across the body with the OTHER. The reach is
 *  the whole move — the arm goes out nearly straight, which is what makes him commit to it. */
export function buildShammgod(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  return buildPoseClip(scene, sk, `bball_shammgod_${dir}`, 0.58, [
    { t: 0,    bones: { Hips: [0, 0, 0],       Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.2,  bones: { Hips: [0, 6 * s, 0],   Spine: [30, -4 * s, 0],  LeftUpLeg: [-48, 0, 12], RightUpLeg: [-24, 0, -12], LeftLeg: [56, 0, 0], RightLeg: [34, 0, 0] }, hands: { Right: [0.30, 0.66, 0.62] as V3, Left: OFF_HAND }, hipsY: -0.15 },   // THE PUSH: the ball shoved out in front, the arm long
    { t: 0.36, bones: { Hips: [0, -18 * s, 0], Spine: [26, 12 * s, 0],  LeftUpLeg: [-40, 0, 14], RightUpLeg: [-28, 0, -14], LeftLeg: [48, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: [0.18, 0.72, 0.52] as V3, Left: [-0.06, 0.70, 0.56] as V3 }, hipsY: -0.13 },   // the OTHER hand arrives on it
    { t: 0.46, bones: { Hips: [0, -28 * s, 0], Spine: [22, 18 * s, 0],  LeftUpLeg: [-36, 0, 16], RightUpLeg: [-32, 0, -16], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: OFF_HAND, Left: [-0.42 * s, 0.88, 0.22] as V3 }, hipsY: -0.11 },   // …and takes it across, the other way entirely
    { t: 0.58, bones: { Hips: [0, -8 * s, 0],  Spine: [14, 0, 0],       ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  ]);
}

/** THE YOYO: the ball on a string, sizing him up. No escape in it — it is the move you make while you decide, so it
 *  stays square, stays tall, and the only thing moving is the ball and the eyes. */
export function buildYoyo(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_yoyo', 0.66, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-2, 0, 0], ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-24, 0, 12], RightUpLeg: [-24, 0, -12], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] }, hands: { Right: [0.30, 1.16, 0.40] as V3, Left: OFF_HAND }, hipsY: -0.04 },   // high on the string
    { t: 0.36, bones: { Hips: [0, 0, 0], Spine: [22, 0, 0], Neck: [-2, 0, 0], LeftUpLeg: [-38, 0, 14], RightUpLeg: [-38, 0, -14], LeftLeg: [48, 0, 0], RightLeg: [48, 0, 0] }, hands: { Right: [0.30, 0.62, 0.44] as V3, Left: OFF_HAND }, hipsY: -0.12 },   // …and snapped low
    { t: 0.52, bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 12], RightUpLeg: [-26, 0, -12], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: [0.30, 1.10, 0.40] as V3, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.66, bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-2, 0, 0], ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  ]);
}

// ── ANKLE BREAKERS: what it looks like from the other side ────────────────────────────────────────────────────
// The defender's answer to all of the above was `karate_hit_react` and `karate_knockdown` — a man being PUNCHED.
// Nobody punched him. He went for a ball that was not there, and the two ways that ends are: you get your feet
// back under you, or you do not.

/** THE STUMBLE: he bit, his weight went the wrong way, and he caught it. One foot crosses over the other, the arms
 *  come out for balance, the chest drops — and he is still up, which is the difference between this and the slip. */
export function buildAnkleStumble(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_ankle_stumble', 0.62, [
    { t: 0,    bones: { Hips: [0, 0, 0],    Spine: [10, 0, 0],   Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 14], RightUpLeg: [-26, 0, -14], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: [0.34, 1.02, 0.18] as V3, Left: [-0.34, 1.02, 0.18] as V3 }, hipsY: -0.08 },
    { t: 0.16, bones: { Hips: [0, -20, 0],  Spine: [26, 14, 0],  Neck: [-2, -10, 0], LeftUpLeg: [-58, 0, -16], RightUpLeg: [-12, 0, -18], LeftLeg: [30, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [0.54, 1.16, 0.10] as V3, Left: [-0.50, 1.24, -0.06] as V3 }, hipsY: -0.14 },   // the weight goes, the lead leg crosses OVER
    { t: 0.32, bones: { Hips: [0, -30, 0],  Spine: [34, 20, 0],  Neck: [4, -14, 0],  LeftUpLeg: [-20, 0, -24], RightUpLeg: [-52, 0, -10], LeftLeg: [26, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.62, 1.04, -0.12] as V3, Left: [-0.56, 1.10, 0.22] as V3 }, hipsY: -0.22 },   // right down on it, arms out — the catch
    { t: 0.46, bones: { Hips: [0, -14, 0],  Spine: [24, 10, 0],  Neck: [0, -6, 0],   LeftUpLeg: [-34, 0, 10], RightUpLeg: [-34, 0, -16], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: [0.44, 1.06, 0.10] as V3, Left: [-0.42, 1.06, 0.12] as V3 }, hipsY: -0.16 },
    { t: 0.62, bones: { Hips: [0, 0, 0],    Spine: [12, 0, 0],   Neck: [-4, 0, 0], LeftUpLeg: [-28, 0, 14], RightUpLeg: [-28, 0, -14], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.34, 1.02, 0.18] as V3, Left: [-0.34, 1.02, 0.18] as V3 }, hipsY: -0.09 },   // back in a stance, late
  ]);
}

/** THE SLIP: he did not catch it. The feet go out from under him sideways and he lands on a hip and a hand — this
 *  is the one the crowd stands up for, and it has to be a FALL, not a knockdown: nothing hit him. */
export function buildAnkleSlip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_ankle_slip', 0.78, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [10, 0, 0],  Neck: [-4, 0, 0],  LeftUpLeg: [-26, 0, 14], RightUpLeg: [-26, 0, -14], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: [0.34, 1.02, 0.18] as V3, Left: [-0.34, 1.02, 0.18] as V3 }, hipsY: -0.08 },
    { t: 0.14, bones: { Hips: [0, -18, 0], Spine: [20, 12, 0], Neck: [2, -8, 0],  LeftUpLeg: [-64, 0, -22], RightUpLeg: [-8, 0, -20], LeftLeg: [22, 0, 0], RightLeg: [14, 0, 0] }, hands: { Right: [0.58, 1.20, 0.04] as V3, Left: [-0.54, 1.26, -0.08] as V3 }, hipsY: -0.16 },   // the foot slides out from under him
    { t: 0.34, bones: { Hips: [0, -26, 0], Spine: [40, 18, 0], Neck: [10, -12, 0], LeftUpLeg: [-86, 0, -30], RightUpLeg: [-30, 0, -22], LeftLeg: [18, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.66, 0.52, -0.20] as V3, Left: [-0.50, 0.92, 0.26] as V3 }, hipsY: -0.52 },   // going down: the hand reaches for the floor behind him
    { t: 0.5,  bones: { Hips: [0, -30, 0], Spine: [46, 20, 0], Neck: [14, -12, 0], LeftUpLeg: [-96, 0, -34], RightUpLeg: [-46, 0, -24], LeftLeg: [26, 0, 0], RightLeg: [58, 0, 0] }, hands: { Right: [0.70, 0.14, -0.30] as V3, Left: [-0.44, 0.70, 0.30] as V3 }, hipsY: -0.74 },   // DOWN — on the hip and the hand
    { t: 0.78, bones: { Hips: [0, -28, 0], Spine: [42, 18, 0], Neck: [10, -10, 0], LeftUpLeg: [-92, 0, -32], RightUpLeg: [-44, 0, -22], LeftLeg: [30, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.68, 0.16, -0.28] as V3, Left: [-0.46, 0.66, 0.28] as V3 }, hipsY: -0.72 },   // sat there watching you go
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

/** The FINGER ROLL, right-handed (owner, 2026-09-16).
 *
 * The finish for a lane nobody is protecting, and the one shape here defined by EXTENSION rather than by a trick:
 * the arm goes out long and high and the ball is not laid against anything — it rolls off the fingertips and takes
 * the softest possible route over the front of the iron. Two tells separate it from a layup at a glance: the arm
 * is STRAIGHT (a layup's is folded) and the ball is carried out IN FRONT of the head rather than up beside it,
 * because you are reaching past the rim, not shielding the ball from anybody.
 *
 * Release at 0.38 s, feet down at 0.78 — a touch longer than a layup, which is the price of the reach. It is the
 * highest-percentage finish in the game after the Mikan, and it only ever appears when nobody is home.
 */
const FINGER_ROLL_KEYS: PoseKey[] = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-24, 0, 6], RightUpLeg: [-24, 0, -6], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.07 },
  { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  Neck: [-8, 0, 0],  LeftUpLeg: [-66, 0, 8], RightUpLeg: [-14, 0, -6], LeftLeg: [62, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [0.26, 1.48, 0.40], Left: [-0.18, 1.30, 0.26] }, hipsY: 0.04 },   // the gather off the stride, the knee driving, the ball going OUT not up
  { t: 0.38, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-78, 0, 8], RightUpLeg: [-8, 0, -6],  LeftLeg: [70, 0, 0], RightLeg: [12, 0, 0] }, hands: { Right: [0.28, 2.12, 0.62], Left: [-0.22, 1.36, 0.22] }, poles: { Right: UP_R }, hipsY: 0.10 },   // RELEASE: the arm STRAIGHT and the ball out IN FRONT — rolled, not laid
  { t: 0.54, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-8, 0, 0],  LeftUpLeg: [-50, 0, 8], RightUpLeg: [-12, 0, -6], LeftLeg: [52, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.28, 2.00, 0.58], Left: [-0.22, 1.32, 0.24] }, poles: { Right: UP_R }, hipsY: 0.05 },   // the hand hangs there after it — the follow IS the shot
  { t: 0.78, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: [0.26, 1.14, 0.30], Left: [-0.24, 1.08, 0.26] }, hipsY: -0.05 },
];
export function buildFingerRoll(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_finger_roll', 0.78, FINGER_ROLL_KEYS);
  return buildPoseClip(scene, sk, 'bball_finger_roll_left', 0.78, FINGER_ROLL_KEYS.map(mirrorKey));
}

/** The MIKAN, right-handed (owner, 2026-09-16: "add more layup animations, up and unders, reverse layup, mikans").
 *
 * The shot from directly under the ring, and the one shape on this list that is defined by what it does NOT do: no
 * stride, no extension, no hang. The knee drives, the ball goes straight up the middle off the glass from beside the
 * ear, and you land ready to do it again on the other foot — which is why it is a drill before it is a shot. The
 * tell is the hand: high and CLOSE, a hand's width off the shoulder line, never out in front.
 *
 * Release at 0.22 s, feet down at 0.5 — the quickest finish in the game, because under the ring the only thing that
 * beats you is time.
 */
const MIKAN_KEYS = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [32, 0, 0], RightLeg: [32, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.10, 0.18] as V3, Left: [-0.18, 1.10, 0.18] as V3 }, hipsY: -0.05 },
  { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-14, 0, 0], LeftUpLeg: [-74, 0, 8], RightUpLeg: [-10, 0, -6], LeftLeg: [70, 0, 0], RightLeg: [14, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.20, 1.56, 0.10] as V3, Left: [-0.14, 1.44, 0.14] as V3 }, hipsY: 0.03 },   // the knee drives, the ball up the middle
  { t: 0.22, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-18, 0, 0], LeftUpLeg: [-80, 0, 8], RightUpLeg: [-6, 0, -6],  LeftLeg: [74, 0, 0], RightLeg: [10, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 2.02, 0.06] as V3, Left: [-0.12, 1.50, 0.12] as V3 }, poles: { Right: UP_R }, hipsY: 0.07 },   // RELEASE: high and CLOSE, off the square
  { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-12, 0, 0], LeftUpLeg: [-52, 0, 8], RightUpLeg: [-14, 0, -6], LeftLeg: [56, 0, 0], RightLeg: [18, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.86, 0.08] as V3, Left: [-0.14, 1.40, 0.14] as V3 }, poles: { Right: UP_R }, hipsY: 0.04 },   // the hand stays up — you are going again
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.14, 0.18] as V3, Left: [-0.18, 1.12, 0.18] as V3 }, hipsY: -0.05 },
];
export function buildMikan(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_mikan', 0.5, MIKAN_KEYS);
  return buildPoseClip(scene, sk, 'bball_mikan_left', 0.5, MIKAN_KEYS.map(mirrorKey));
}

/** The UP AND UNDER, right-handed: two moves in one clip, and the clip only works if the first one is a LIE.
 *
 * The ball and the shoulders drive up hard enough to be a shot — heels off the floor, chin up, eyes at the rim —
 * and then, at the moment he leaves the floor, the hips DROP and the body steps through UNDER the arm that just
 * went up. The finish is extended on the far side, laid up under him rather than over him.
 *
 * It needs the length the other finishes do not: the sell is 0.30 s of the clip before the duck even starts, so
 * the release key is 0.46 and the feet come down at 0.85. That length IS the risk — a defender who does not bite
 * has all of it to recover.
 */
const UP_UNDER_KEYS = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0],  Neck: [-4, 0, 0],  LeftUpLeg: [-26, 0, 8], RightUpLeg: [-26, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
  { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0],  Neck: [-16, 0, 0], LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.80, 0.16] as V3, Left: [-0.18, 1.74, 0.18] as V3 }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.01 },   // THE SELL: ball and shoulders up, chin up, heels light
  { t: 0.30, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0],  Neck: [-16, 0, 0], LeftUpLeg: [-14, 0, 6], RightUpLeg: [-14, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.84, 0.16] as V3, Left: [-0.18, 1.78, 0.18] as V3 }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.02 },   // held — he is in the air now
  { t: 0.38, bones: { Hips: [0, 14, 0], Spine: [20, -10, 0], Neck: [-4, 8, 0], LeftUpLeg: [-64, 0, 14], RightUpLeg: [-16, 0, -8], LeftLeg: [52, 0, 0], RightLeg: [28, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.34, 1.10, 0.34] as V3, Left: [-0.06, 1.24, 0.30] as V3 }, hipsY: -0.14 },   // THE DUCK: hips drop, the lead leg steps through under his arm
  { t: 0.46, bones: { Hips: [0, 22, 0], Spine: [8, -14, 0], Neck: [-8, 10, 0], LeftUpLeg: [-72, 0, 12], RightUpLeg: [-10, 0, -8], LeftLeg: [46, 0, 0], RightLeg: [16, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.40, 1.92, 0.26] as V3, Left: [-0.04, 1.30, 0.28] as V3 }, poles: { Right: UP_R }, hipsY: 0.01 },   // RELEASE: extended on the FAR side, under him
  { t: 0.62, bones: { Hips: [0, 20, 0], Spine: [10, -12, 0], Neck: [-6, 8, 0], LeftUpLeg: [-48, 0, 12], RightUpLeg: [-14, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [22, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.38, 1.78, 0.28] as V3, Left: [-0.08, 1.26, 0.28] as V3 }, poles: { Right: UP_R }, hipsY: -0.02 },
  { t: 0.85, bones: { Hips: [0, 10, 0], Spine: [12, -6, 0], Neck: [-4, 4, 0], LeftUpLeg: [-22, 0, 8], RightUpLeg: [-22, 0, -8], LeftLeg: [32, 0, 0], RightLeg: [32, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.26, 1.12, 0.28] as V3, Left: [-0.22, 1.08, 0.26] as V3 }, hipsY: -0.07 },
];
export function buildUpAndUnder(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_up_and_under', 0.85, UP_UNDER_KEYS);
  return buildPoseClip(scene, sk, 'bball_up_and_under_left', 0.85, UP_UNDER_KEYS.map(mirrorKey));
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
// …and the EURO sells to a SIDE. planEuro already picks which way to sell (`euroSell` reads the stick) and returns
// the crossing side with it, but the mode chose the clip by `plan.kind` alone — so a euro that sold LEFT still played
// the sell-right shape, and the body went one way while the move went the other.
const EURO_KEYS: PoseKey[] = [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [14, 0, 0],   Neck: [-4, 0, 0], LeftUpLeg: [-28, 0, 8], RightUpLeg: [-28, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
    { t: 0.22, bones: { Hips: [0, -14, 0], Spine: [16, 10, 0],  Neck: [-6, -8, 0], LeftUpLeg: [-20, 0, 8], RightUpLeg: [-52, 0, -18], LeftLeg: [30, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.46, 1.06, 0.22], Left: [0.10, 1.10, 0.26] }, hipsY: -0.05 },   // STEP A: the right leg plants wide, the ball swung out over that hip — the sell
    { t: 0.36, bones: { Hips: [0, 10, 0],  Spine: [16, -8, 0],  Neck: [-6, 6, 0],  LeftUpLeg: [-56, 0, 16], RightUpLeg: [-16, 0, -8], LeftLeg: [52, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [-0.10, 1.04, 0.28], Left: [-0.34, 1.06, 0.26] }, hipsY: -0.04 },   // STEP B: snatched across, the left leg crossing the other way
    { t: 0.48, bones: { Hips: [0, 14, 0],  Spine: [14, -10, 0], Neck: [-6, 8, 0],  LeftUpLeg: [-26, 0, 12], RightUpLeg: [-34, 0, -8], LeftLeg: [36, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [-0.18, 1.08, 0.30], Left: [-0.36, 1.08, 0.24] }, hipsY: -0.09 },   // planted the other side of him, loaded to finish
];
export function buildEuroStep(scene: Scene, sk: Skeleton, sell: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (sell === 'right') return buildPoseClip(scene, sk, 'bball_euro_step', 0.48, EURO_KEYS);
  return buildPoseClip(scene, sk, 'bball_euro_step_left', 0.48, EURO_KEYS.map(mirrorKey));
}
