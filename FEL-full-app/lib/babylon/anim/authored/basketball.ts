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
import type { Scene, Skeleton, AnimationGroup, TransformNode } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';
import { hangFor } from './locomotion';
import { pathFor, pathAt, strokeStretch, type HandleStance, type HandlePath, type PathMove } from '../handlePaths';   // HOOPS MOTION phase 4c: the v2 handle clips follow the ball's path
import { HOOPS_DRIBBLE, fitDribbleToReach } from '../Dribble';
import { armChain } from '../HandIK';
import { bindFrame } from '../bindFrame';
import { findBone } from '../boneLookup';

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
  'bball_momentum_cross_left', 'bball_momentum_cross_right',   // HOOPS MOTION phase 4c (plan §4.2): the momentum cross on its own (wider) path
  'bball_btb_slide_left', 'bball_btb_slide_right',   // H2 (owner 2026-10-16): the BTB slide — the behind-the-back's wrap with the body skipping sideways
  'bball_hesi_v2_left', 'bball_hesi_v2_right',   // H2b (plan §4.8): the hesitation on its float path — the rise that sells it, then low for the explode
  'bball_yoyo_v2_left', 'bball_yoyo_v2_right',   // H2b (plan §4.9): the yoyo on its pound-then-float path
  'bball_pausin_left', 'bball_pausin_right',     // H2b (plan §4.18): PAUSIN' — the ball held out, the palm on top, low and back
  'bball_jab',                                   // H2b (plan §4.11): the triple-threat jab step (its own clip; it played the hesi)
  'bball_pivot_v2_left', 'bball_pivot_v2_right', // H2b (plan §4.16): the pivot at real speed, the root owns the turn
  'bball_ankle_stumble', 'bball_ankle_slip',
  'bball_stepback_gather',
  'bball_hop_step', 'bball_euro_step',
  // ACROBATIC LAYUPS (2026-09-18): the scoop (contact), the spin, the hang / double clutch
  'bball_layup_scoop', 'bball_layup_scoop_left', 'bball_layup_spin', 'bball_layup_spin_left', 'bball_layup_hang', 'bball_layup_hang_left',
  // THE POST GAME (2026-09-18): the shimmy before a fade, the drop step around the man
  'bball_shimmy', 'bball_drop_step', 'bball_drop_step_left',
  'bball_idle_stand',   // HOOPS MOTION phase 3b (review): the ball-less watch with its own knees (idle_stand keys none)
] as const;
type V3 = [number, number, number];

const STANCE: Record<string, Deg3> = { LeftUpLeg: [-22, 0, 8], RightUpLeg: [-22, 0, -8], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] };
const BALL_HAND: V3 = [0.25, 0.95, 0.30];       // the live dribble, waist height, out front
const OFF_HAND: V3 = [-0.25, 1.00, 0.12];       // relaxed, slightly forward
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];
const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];
/** HOOPS MOTION phase 3c (plan §3 "Smoothing": `hold: true` on the accents). Every bball_* clip is a joint-space cubic now (smoothKeys);
 *  these keys ease to a stop — zero velocity in and out — because the move lives there: a shot's or a finish's RELEASE (the ball leaves
 *  a hand that has arrived), the top of a FAKE (the sell), the hesi's CHECK, the block's reach at its HEIGHT. mirrorKey carries it. */
function accent<K extends PoseKey>(keys: K[], ...at: number[]): K[] { return keys.map((k) => (at.some((t) => Math.abs(t - k.t) < 1e-6) ? { ...k, hold: true } : k)); }

/** Ball-hand pump on a bent-knee stance. Loops. */
export function buildDribbleIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const key = (t: number, spine: number, hand: V3, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...STANCE }, hands: { Right: hand, Left: OFF_HAND }, hipsY });
  return buildPoseClip(scene, sk, 'bball_dribble_idle', 0.8, [key(0, 14, BALL_HAND, -0.05), key(0.4, 17, [0.22, 0.82, 0.32], -0.07), key(0.8, 14, BALL_HAND, -0.05)]);
}

/** HOOPS MOTION phase 3b (review): THE BALL-LESS WATCH HAS KNEES. The tree's `watch` (a body with no ball that is not defending: the
 *  shooter watching his arc, a mate spacing, the rival after his release) played `idle_stand`, which keys the hips, the spine, the neck
 *  and the hands and NO LEG BONE — so its knees were whatever the clip before it left: 21–95° across takes (base2, 3b's rB/rC; the 1v1
 *  hero 63.4 → 28.2° in one session, the 3PT shooter alternating 76 / 41°). This is idle_stand's own breath and hang on a soft athletic
 *  stance keyed on every key (knees ≈ 26°, the hips down by the legs' shortening), so it reads the same on every take. */
export const WATCH_LEGS: Record<string, Deg3> = { LeftUpLeg: [-14, 0, 5], RightUpLeg: [-14, 0, -5], LeftLeg: [26, 0, 0], RightLeg: [26, 0, 0] };
export const WATCH_DROP = -0.021;
export function buildIdleStandHoops(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const HANG = hangFor(sk);
  const poles = { Left: [-0.2, -0.3, -0.9] as V3, Right: [0.2, -0.3, -0.9] as V3 };   // (idle_stand's: the elbows slightly back)
  const key = (t: number, spine: number, neck: Deg3, lift: number, hipsY: number): PoseKey => ({
    t, bones: { Hips: [0, 0, 0], Spine: [spine, 0, 0], Neck: neck, ...WATCH_LEGS },
    hands: { Left: [HANG.Left[0] - lift * 0.3, HANG.Left[1] + lift + WATCH_DROP, HANG.Left[2]], Right: [HANG.Right[0] + lift * 0.3, HANG.Right[1] + lift + WATCH_DROP, HANG.Right[2]] },
    poles, hipsY: hipsY + WATCH_DROP,
  });
  return buildPoseClip(scene, sk, 'bball_idle_stand', 3.0, [key(0, 4, [0, 0, 0], 0, 0), key(1.5, 6.5, [2, 3, 0], 0.02, -0.012), key(3, 4, [0, 0, 0], 0, 0)]);
}

/** Crossover (HOOPS MOTION phase 4c, v2): see THE CROSSING CLIPS below. `dir` is the side the ball ENDS on (MOVE_CLIP): `_left` is the
 *  right hand's crossover, `_right` its mirror. */
export function buildCrossover(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_crossover_${dir}`, 'crossover', CROSSOVER_V2, dir === 'right');
}
/** The MOMENTUM CROSS (phase 4c, plan §4.2): the crossover's body, wider and lower, on the momentum cross's own path (its floor 0.14 m
 *  further ahead, the catch 0.08 m wider) — the capture's crossover played fast was 0.1 m off both of its contacts. */
export function buildMomentumCross(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_momentum_cross_${dir}`, 'momentum_cross', MOMENTUM_CROSS_V2, dir === 'right');
}

/** Hesitation: a stutter — the body checks, the ball hand holds, the knees load. */
export function buildHesi(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_hesi', 0.55, accent([
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [0, 0, 0],  ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-8, 0, 0], LeftUpLeg: [-10, 0, 8], RightUpLeg: [-10, 0, -8], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.26, 0.98, 0.31], Left: OFF_HAND }, hipsY: -0.02 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-14, 0, 8], RightUpLeg: [-14, 0, -8], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [0.26, 0.96, 0.31], Left: OFF_HAND }, hipsY: -0.04 },
    { t: 0.55, bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [0, 0, 0],  LeftUpLeg: [-28, 0, 8], RightUpLeg: [-28, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
  ], 0.2));
}

/** Mirror a pose key across the body's midline: hands / poles / feet x negated and the sides swapped, the left and right
 *  leg bones swapped, the torso's yaw / roll negated. (The keys authored here are pitch-only in the torso.)
 *  HOOPS MOTION phase 3 (2026-09-25): EVERY sided field. It carried `hands` and `poles` only, so a `_left` clip lost its `handsRel`
 *  (the left spin layup's two-hand tuck — its gather was one hand), its `feet` and `kneePoles`, and its `hold` accents. */
export function mirrorKey(k: PoseKey): PoseKey {
  const swapSide = (n: string) => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;
  const bones: Record<string, Deg3> | undefined = k.bones && Object.fromEntries(Object.entries(k.bones).map(([n, [x, y, z]]) => [swapSide(n), [x, -y, -z] as Deg3]));
  const flip = (h?: { Left?: V3; Right?: V3 }) => {
    if (!h) return undefined;
    const o: { Left?: V3; Right?: V3 } = {};
    if (h.Right) o.Left = mirror(h.Right);
    if (h.Left) o.Right = mirror(h.Left);
    return o;
  };
  const out: PoseKey = { t: k.t, bones, hands: flip(k.hands), poles: flip(k.poles), hipsY: k.hipsY };
  if (k.handsRel) out.handsRel = flip(k.handsRel);
  if (k.handsBody) out.handsBody = flip(k.handsBody);   // (phase 4c: a v2 handle clip's hands on the path)
  if (k.feet) out.feet = flip(k.feet);
  if (k.kneePoles) out.kneePoles = flip(k.kneePoles);
  if (k.hold !== undefined) out.hold = k.hold;
  if (k.kneesFront) out.kneesFront = true;
  return out;
}

/** The right-hand layup: the inside (right) knee drives up as the ball hand rises to the top, the finish extends toward the
 *  glass with the off arm shielding, then the feet come down the FRONT to a soft stance (HOOPS-MOVE-KIT-A M3: the finish
 *  used to be the dunk launch clip — a two-arm sweep through a T). The release is the 0.3 s key; the modes pace the clip so
 *  it lands on the meter's green and ride the hop to the 0.7 s landing key. */
const LAYUP_KEYS = accent([
  { t: 0,   bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
  { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], LeftUpLeg: [4, 0, 4],   RightUpLeg: [-82, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [78, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.20, 1.95, 0.15] as V3, Left: [-0.30, 1.25, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.02 },
  { t: 0.5, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [8, 0, 4],   RightUpLeg: [-70, 0, -4], LeftLeg: [4, 0, 0],  RightLeg: [60, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.98, 0.10] as V3, Left: [-0.30, 1.20, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.05 },
  // feet-down: the legs under the body, the ball arm comes down the front, the off hand to the hip
  { t: 0.7, bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  LeftUpLeg: [-16, 0, 6], RightUpLeg: [-16, 0, -6], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.12, 0.30] as V3, Left: [-0.24, 1.08, 0.28] as V3 }, hipsY: -0.04 },
], 0.3);
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

/** The STEP-BACK gather (owner, 2026-09-16), 0.46 s — STEPBACK_SEC of push-off plus GATHER_STEPBACK_TAIL_SEC of set.
 *
 * The step-back already existed as a GatherKind: the mode drives the root backwards at STEPBACK_SPEED and the HUD
 * calls it STEP-BACK. What it did not have was a body — `startRise` plays `bball_pullup_gather` for every gather
 * kind, so a step-back was a player SLIDING backwards in a pull-up's pose, feet planted, nothing pushing.
 *
 * The difference from the pull-up is the whole move: a pull-up stops, a step-back stops and then THROWS ITSELF
 * AWAY. The lead leg extends hard against the floor, the hips travel out behind the feet, the trail leg swings
 * back to catch the landing, and the ball is swept back with the body rather than lifted where you stood. The last
 * key squares up: a step-back you cannot shoot out of is just a retreat.
 */
export function buildStepbackGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_stepback_gather', 0.46, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [16, 0, 0],  Neck: [-4, 0, 0], ...STANCE }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
    { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [30, 0, 0],  Neck: [-8, 0, 0], LeftUpLeg: [-52, 0, 10], RightUpLeg: [-18, 0, -10], LeftLeg: [66, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [0.28, 0.82, 0.40] as V3, Left: [0.06, 0.86, 0.38] as V3 }, hipsY: -0.18 },   // THE PLANT: weight forward onto the lead leg, deep — this is the push
    { t: 0.3,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0],  Neck: [-2, 0, 0], LeftUpLeg: [10, 0, 10], RightUpLeg: [-40, 0, -10], LeftLeg: [16, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.20, 1.06, 0.02] as V3, Left: [-0.06, 1.04, 0.04] as V3 }, hipsY: -0.02 },   // THE PUSH-OFF: the lead leg drives straight, the hips go out BEHIND the feet, the ball swept back with them
    { t: 0.46, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-30, 0, 10], RightUpLeg: [-30, 0, -10], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: [0.14, 1.28, 0.24] as V3, Left: [-0.10, 1.26, 0.26] as V3 }, hipsY: -0.11 },   // SET: squared and loaded — a step-back you cannot shoot out of is a retreat
  ]);
}

/** The FLOATER (HOOPS-MOVE-KIT-A M3): a runner off the stride — the knee comes up, the ball to the chest, then a one-hand
 *  push from the forehead, the arm high and in front, the off hand at the chest; the legs come down under the body. The
 *  release is the 0.35 s key (the top of the hop); the modes pace it to the meter and hold the 0.7 s landing key. */
// THE RUNNER, either hand (2026-09-16). The shape was always right; what it did not have was a LEFT, and
// FINISH_CLIP.floater pointed both sides at this one clip — so a floater taken going left pushed the ball up with
// the right hand, across the body, in front of the help it was supposed to be getting over.
const FLOATER_KEYS: PoseKey[] = accent([
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [0, 0, 0],  LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.05 },
    { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-6, 0, 4],  RightUpLeg: [-50, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [56, 0, 0] }, hands: { Right: [0.12, 1.32, 0.30], Left: [-0.14, 1.28, 0.30] }, hipsY: 0 },   // the gather off the stride, the ball to the chest
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [-2, 0, 4],  RightUpLeg: [-72, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [70, 0, 0] }, hands: { Right: [0.12, 2.05, 0.30], Left: [-0.25, 1.35, 0.20] }, poles: { Right: UP_R }, hipsY: 0.04 },   // the push: the ball arm high and in front, the runner's knee up (measured: −56° lifted the knee 0.21 m, −82° 0.42)
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-12, 0, 4], RightUpLeg: [-30, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: [0.16, 1.90, 0.35], Left: [-0.24, 1.30, 0.22] }, poles: { Right: UP_R }, hipsY: 0.02 },   // the follow: the arm stays up, the knee comes down
    { t: 0.7,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-16, 0, 6], RightUpLeg: [-16, 0, -6], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] }, hands: { Right: [0.24, 1.12, 0.30], Left: [-0.24, 1.08, 0.28] }, hipsY: -0.04 },   // feet-down, the arm down the front
], 0.35);
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

/** IN AND OUT (phase 4c v2, plan §4.7): one hand — pushed in toward the midline as if it were crossing, the SAME hand takes it back out.
 *  `dir` is the hand (the side the ball ends on): `_right` is the right hand's, `_left` its mirror. */
export function buildInAndOut(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_in_and_out_${dir}`, 'in_and_out', IN_AND_OUT_V2, dir === 'left');
}
/** BETWEEN THE LEGS (phase 4c v2, plan §4.3): the split stance (the catch side's foot forward) and the hips down under the bridge. */
export function buildBetweenLegsDribble(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_between_legs_${dir}`, 'between_legs', BETWEEN_V2, dir === 'right');
}
/** BEHIND THE BACK (phase 4c v2, plan §4.4): one right-hand key set (`_left`), `_right` = its mirror (mirrorKey). */
export function buildBehindBackDribble(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_behind_back_${dir}`, 'behind_back', BEHIND_V2, dir === 'right');
}
/** THE HESITATION, v2 (H2b, hoops-motion plan §4.8): the hesi's float path (anim/handlePaths: a high, slow bounce over the load and the
 *  rise, then a pound forward) with the body that sells it (HESI_V2). `dir` is the ball's hand (a hesi keeps it): `_right` the right
 *  hand's, `_left` its mirror. The capture that played as `bball_hesi` (06_12 2.55–3.10 s) is "a hard low dribble" — the opposite of
 *  the read (the plan's own words); it stays for the calls that still name it (the jab, the post shimmy, the rival's step-back). */
export function buildHesiV2(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_hesi_v2_${dir}`, 'hesi', HESI_V2, dir === 'left');
}
/** THE YOYO, v2 (H2b, plan §4.9): on its own path — a low pound, then the ball floated high — square and tall, only the ball, the
 *  knees and the eyes move. `dir` is the ball's hand. */
export function buildYoyoV2(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_yoyo_v2_${dir}`, 'yoyo', YOYO_V2, dir === 'left');
}
/** PAUSIN' (H2b, plan §4.18): the stick held — the ball out to the side at hip height with the palm on top, the body low and the
 *  weight back, for up to PAUSIN_MAX_SEC (0.9 s, the owner's pick). The mode HOLDS this clip; the carry holds the ball on the pausin
 *  path. `dir` is the ball's hand. (It played the hesi capture at a quarter speed with the carry parked.) */
export function buildPausin(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_pausin_${dir}`, 'pausin', PAUSIN_V2, dir === 'left');
}
/** The ankle targets of a key authored straight into buildPoseClip (handleV2Keys does this for the v2 tables): the target in the
 *  final pose is raised by the key's hipsY, because the legs are solved with the hips at bind. */
const feetAt = (hipsY: number, f: { Left: V3; Right: V3 }) => ({ Left: [f.Left[0], f.Left[1] - hipsY, f.Left[2]] as V3, Right: [f.Right[0], f.Right[1] - hipsY, f.Right[2]] as V3 });
/** THE JAB (H2b, plan §4.11): from triple threat, the right foot jabs 0.30 m out toward the drive and comes back; the pivot (left)
 *  foot stays; the shoulders and the head sell it, the ball ripped low on the far hip with both hands. 0.35 s — the jab's own
 *  timing (TripleThreat). It played `bball_hesi` (the hesitation) before. */
export function buildJab(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const H = (y: number) => y;
  return buildPoseClip(scene, sk, 'bball_jab', 0.35, accent([
    { t: 0,    bones: { ...torso(0, 16) }, hands: { Right: [0.20, 0.96, 0.22] as V3, Left: [0.02, 0.98, 0.26] as V3 }, hipsY: H(-0.10), feet: feetAt(-0.10, STANCE_FEET), kneesFront: true },
    { t: 0.10, bones: { ...torso(-8, 24, 4, [-2, 0, 0]) }, hands: { Right: [0.24, 0.86, 0.16] as V3, Left: [0.04, 0.90, 0.20] as V3 }, hipsY: H(-0.16), feet: feetAt(-0.16, { Left: STANCE_FEET.Left, Right: [0.30, ANKLE_Y + 0.03, 0.28] }), kneesFront: true },
    { t: 0.18, bones: { ...torso(-9, 26, 5, [-2, 0, 0]) }, hands: { Right: [0.25, 0.85, 0.15] as V3, Left: [0.05, 0.89, 0.19] as V3 }, hipsY: H(-0.17), feet: feetAt(-0.17, { Left: STANCE_FEET.Left, Right: [0.32, ANKLE_Y, 0.30] }), kneesFront: true },
    { t: 0.28, bones: { ...torso(-3, 20, 1) }, hands: { Right: [0.22, 0.92, 0.20] as V3, Left: [0.03, 0.95, 0.24] as V3 }, hipsY: H(-0.12), feet: feetAt(-0.12, { Left: STANCE_FEET.Left, Right: [0.22, ANKLE_Y + 0.04, 0.14] }), kneesFront: true },
    { t: 0.35, bones: { ...torso(0, 16) }, hands: { Right: [0.20, 0.96, 0.22] as V3, Left: [0.02, 0.98, 0.26] as V3 }, hipsY: H(-0.10), feet: feetAt(-0.10, STANCE_FEET), kneesFront: true },
  ], 0.18), { smooth: true });
}
/** THE PIVOT, v2 (H2b, plan §4.16): the turn on a planted foot at REAL speed. The capture that stood in for `bball_pivot` (78_31)
 *  packed 1.1 s of motion into the 0.42 s turn — 2.6× real — with 83° of hip yaw baked in on top of the root's own turn. The root
 *  owns the turn (planPivot); this keys no yaw: the pivot foot stays where the stance put it (the body turns about it), the free foot
 *  lifts and comes down, the ball is held across the body, the chest stays tall. `free` names the free foot: `_right` the right
 *  foot steps (the left is the pivot), `_left` its mirror. */
export function buildPivotV2(scene: Scene, sk: Skeleton, free: 'left' | 'right' = 'right'): AnimationGroup | null {
  const keys: PoseKey[] = [
    { t: 0,    bones: { ...torso(0, 14) }, hands: { Right: [0.14, 1.00, 0.26] as V3, Left: [-0.06, 1.02, 0.28] as V3 }, hipsY: -0.10, feet: feetAt(-0.10, STANCE_FEET), kneesFront: true },
    { t: 0.12, bones: { ...torso(0, 16) }, hands: { Right: [0.12, 0.98, 0.26] as V3, Left: [-0.08, 1.00, 0.28] as V3 }, hipsY: -0.08, feet: feetAt(-0.08, { Left: STANCE_FEET.Left, Right: [0.18, ANKLE_Y + 0.08, 0.04] }), kneesFront: true },
    { t: 0.26, bones: { ...torso(0, 14) }, hands: { Right: [0.10, 1.00, 0.27] as V3, Left: [-0.10, 1.02, 0.28] as V3 }, hipsY: -0.08, feet: feetAt(-0.08, { Left: STANCE_FEET.Left, Right: [0.22, ANKLE_Y + 0.07, 0.06] }), kneesFront: true },
    { t: 0.36, bones: { ...torso(0, 14) }, hands: { Right: [0.13, 1.00, 0.26] as V3, Left: [-0.07, 1.02, 0.28] as V3 }, hipsY: -0.10, feet: feetAt(-0.10, STANCE_FEET), kneesFront: true },
    { t: 0.42, bones: { ...torso(0, 14) }, hands: { Right: [0.14, 1.00, 0.26] as V3, Left: [-0.06, 1.02, 0.28] as V3 }, hipsY: -0.10, feet: feetAt(-0.10, STANCE_FEET), kneesFront: true },
  ];
  return buildPoseClip(scene, sk, `bball_pivot_v2_${free}`, 0.42, free === 'right' ? keys : keys.map(mirrorKey), { smooth: true });
}
/** THE BTB SLIDE (H2, owner 2026-10-16): the behind-the-back's wrap and path with the body skipping sideways the ball's way (SLIDE_V2).
 *  `dir` is the side the ball ENDS on, as the behind-the-back's: `_left` is the right hand's, `_right` its mirror. */
export function buildBtbSlide(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_btb_slide_${dir}`, 'behind_back', SLIDE_V2, dir === 'right');
}
/** DOUBLE CROSS (phase 4c v2, plan §4.5): two crossings, the second lower — it ends in the START hand (owner Q5), so `_right` is the right
 *  hand's (the side the ball ends on) and `_left` its mirror. */
export function buildDoubleCross(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_double_cross_${dir}`, 'double_cross', DOUBLE_CROSS_V2, dir === 'left');
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

/** THE SHAMMGOD (phase 4c v2, plan §4.6): pushed out long with one hand, the OTHER hand arrives on it and pulls it across. */
export function buildShammgod(scene: Scene, sk: Skeleton, dir: 'left' | 'right' = 'right'): AnimationGroup | null {
  return buildHandleV2(scene, sk, `bball_shammgod_${dir}`, 'shammgod', SHAMMGOD_V2, dir === 'right');
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

/** LIE THE PELVIS, AND LET THE ARMS FOLLOW IT (rig sweep, 2026-09-18).
 *
 *  The going-down keys carried only YAW on Hips while hipsY dropped 0.74, so the pelvis stayed bolt upright and the
 *  legs hung from a vertical socket straight through the floor — measured -0.516, half a metre of shin under the court
 *  on the one clip the crowd stands up for. Rotating Hips lays the chain down; the knees fold so the feet come up with
 *  the hips rather than being dragged under the floor by them.
 *
 *  Rotating the pelvis 62° then broke the ARMS, and the same way the spin layup's did (see buildSpinLayup): `hands`
 *  targets are ABSOLUTE FROM THE ROOT, so a pelvis that pitches back swings both shoulders down and behind while the
 *  targets stay where an UPRIGHT body would have put them. Measured: 0.67 m and 0.86 m of requested reach against a
 *  0.54 m arm, so the solver straightened both arms and stopped short — 178° at every frame from t=0.36 to the end,
 *  a scarecrow lying on the court. The down keys are `handsRel` now: measured from the POSED shoulder, so |rel| IS the
 *  elbow (0.44-0.46 ≈ 110-120°) and it stays that whatever the pelvis does. The two standing keys keep `hands`.
 *
 *  THE SLIP: he did not catch it. The feet go out from under him sideways and he lands on a hip and a hand — this
 *  is the one the crowd stands up for, and it has to be a FALL, not a knockdown: nothing hit him. */
export function buildAnkleSlip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_ankle_slip', 0.78, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [10, 0, 0],  Neck: [-4, 0, 0],  LeftUpLeg: [-26, 0, 14], RightUpLeg: [-26, 0, -14], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] }, hands: { Right: [0.34, 1.02, 0.18] as V3, Left: [-0.34, 1.02, 0.18] as V3 }, hipsY: -0.08 },
    { t: 0.14, bones: { Hips: [0, -18, 0], Spine: [20, 12, 0], Neck: [2, -8, 0],  LeftUpLeg: [-64, 0, -22], RightUpLeg: [-8, 0, -20], LeftLeg: [22, 0, 0], RightLeg: [14, 0, 0] }, hands: { Right: [0.58, 1.20, 0.04] as V3, Left: [-0.54, 1.26, -0.08] as V3 }, hipsY: -0.16 },   // the foot slides out from under him
    { t: 0.34, bones: { Hips: [-40, -26, 0], Spine: [16, 18, 0], Neck: [10, -12, 0], LeftUpLeg: [-58, 0, -30], RightUpLeg: [-34, 0, -22], LeftLeg: [66, 0, 0], RightLeg: [76, 0, 0] }, handsRel: { Right: [0.10, -0.40, -0.16] as V3, Left: [-0.34, -0.14, 0.22] as V3 }, hipsY: -0.44 },   // going down: the hand reaches for the floor behind him
    { t: 0.5,  bones: { Hips: [-62, -30, 0], Spine: [12, 20, 0], Neck: [14, -12, 0], LeftUpLeg: [-74, 0, -34], RightUpLeg: [-52, 0, -24], LeftLeg: [96, 0, 0], RightLeg: [104, 0, 0] }, handsRel: { Right: [0.06, -0.44, -0.12] as V3, Left: [-0.30, -0.24, 0.20] as V3 }, hipsY: -0.66 },   // DOWN — on the hip and the hand, knees up
    { t: 0.78, bones: { Hips: [-60, -28, 0], Spine: [12, 18, 0], Neck: [10, -10, 0], LeftUpLeg: [-72, 0, -32], RightUpLeg: [-50, 0, -22], LeftLeg: [94, 0, 0], RightLeg: [102, 0, 0] }, handsRel: { Right: [0.06, -0.43, -0.12] as V3, Left: [-0.30, -0.23, 0.20] as V3 }, hipsY: -0.64 },   // sat there watching you go
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
  return buildPoseClip(scene, sk, 'bball_block_reach', 0.5, accent([
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [8, 0, 0], ...LOAD },  hands: { Right: [0.25, 1.00, 0.25], Left: mirror([0.25, 1.00, 0.25]) } },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], ...LONG }, hands: up, poles: { Right: UP_R, Left: UP_L } },
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], ...LONG }, hands: { Right: [0.22, 1.98, 0.08], Left: [-0.22, 1.98, 0.08] }, poles: { Right: UP_R, Left: UP_L } },
  ], 0.25));
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

/** THE RELEASE READS IN THE BODY (HOOPS-DEPTH S6, 2026-09-23). Every jump shot played the one follow-through, so an early or
 *  late release looked exactly like a green one until the ball got to the rim. In 2K the body shows it first. An EARLY
 *  release comes out of a low set point: the jumper was meter-paced and had not reached the top, so it is a short arm, the
 *  ball pushed off the forehead with the elbow still bent. A LATE release is on the way down: it starts from the top, the
 *  chest pitches forward and the hands push out flat, and the body lands heavy and straight-legged. Both come down the front
 *  to the same stance as the green follow-through, so the absorb and the loop after them are unchanged. */
export function buildFollowThroughEarly(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const rising: Record<string, Deg3> = { LeftUpLeg: [-10, 0, 4], RightUpLeg: [-10, 0, -4], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0] };
  const soft: Record<string, Deg3> = { LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] };
  return buildPoseClip(scene, sk, 'bball_follow_through_early', 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-4, 0, 0], ...rising }, hands: { Right: [0.20, 1.60, 0.26], Left: [-0.14, 1.56, 0.24] } },   // below the top: the set point, elbows bent
    { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-6, 0, 0], ...rising }, hands: { Right: [0.22, 1.60, 0.44], Left: [-0.22, 1.36, 0.30] } },   // the short arm: pushed forward off the forehead, never up
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-4, 0, 0], ...soft }, hands: { Right: [0.24, 1.50, 0.40], Left: [-0.24, 1.24, 0.30] }, hipsY: -0.02 },
    { t: 0.6,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], ...soft }, hands: { Right: [0.26, 1.18, 0.34], Left: [-0.26, 1.12, 0.30] }, hipsY: -0.04 },
  ]);
}
export function buildFollowThroughLate(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const flat: Record<string, Deg3> = { LeftUpLeg: [-4, 0, 4], RightUpLeg: [-4, 0, -4], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0] };
  const heavy: Record<string, Deg3> = { LeftUpLeg: [-18, 0, 7], RightUpLeg: [-18, 0, -7], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] };
  const soft: Record<string, Deg3> = { LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] };
  return buildPoseClip(scene, sk, 'bball_follow_through_late', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-6, 0, 0], ...flat }, hands: { Right: [0.18, 2.02, 0.22], Left: [-0.16, 1.92, 0.24] }, poles: { Right: UP_R, Left: UP_L } },   // the top, where the green one starts
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-12, 0, 0], ...flat }, hands: { Right: [0.22, 1.80, 0.58], Left: [-0.20, 1.68, 0.48] } },   // on the way down: the chest pitches over, the ball pushed out flat
    { t: 0.4,  bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-8, 0, 0], ...heavy }, hands: { Right: [0.24, 1.46, 0.50], Left: [-0.24, 1.34, 0.40] }, hipsY: -0.06 },   // a heavy landing
    { t: 0.7,  bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  Neck: [-4, 0, 0], ...soft }, hands: { Right: [0.26, 1.18, 0.34], Left: [-0.26, 1.12, 0.30] }, hipsY: -0.04 },
  ]);
}

/** The grounded HAND-UP contest (HOOPS-MOVE-KIT-A D3): the near arm straight up, the off arm out low in front, a wide low
 *  stance on the floor — verticality, no jump. Loops with a small sway; the mode HOLDS it while the contest button is held. */
export function buildHandUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const stance: Record<string, Deg3> = { LeftUpLeg: [-26, 0, 20], RightUpLeg: [-26, 0, -20], LeftLeg: [38, 0, 0], RightLeg: [38, 0, 0] };
  const key = (t: number, hand: V3, sway: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [6, 0, sway] as Deg3, Neck: [-6, 0, 0] as Deg3, ...stance }, hands: { Right: hand, Left: [-0.36, 1.02, 0.30] as V3 }, poles: { Right: UP_R }, hipsY: -0.09 });
  return buildPoseClip(scene, sk, 'bball_hand_up', 0.7, [key(0, [0.18, 2.02, 0.10], 0), key(0.35, [0.21, 2.0, 0.14], 2), key(0.7, [0.18, 2.02, 0.10], 0)]);
}

/** THE LANDING ABSORB (HOOPS-DEPTH S4, 2026-09-23). A jump shot came down from its hop straight into the loop the game asked
 *  for — the follow-through's arms-overhead key faded into a dribble idle or a stance in one crossfade, with nothing in the
 *  legs: the body landed like a puppet set down. 2K lands every jump on an absorb: the knees take it, the torso drops,
 *  the arms come down, then the recovery. 0.3 s from a loaded catch (knees 46°, the hips 7 cm down, the hands still high
 *  from the release) to the neutral stance; the tree's release runs the loop after it. */
export function buildLandAbsorb(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'bball_land_absorb', 0.3, [
    { t: 0,   bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-38, 0, 10], RightUpLeg: [-38, 0, -10], LeftLeg: [46, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [0.24, 1.58, 0.22] as V3, Left: [-0.22, 1.50, 0.18] as V3 }, hipsY: -0.07 },
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-30, 0, 9],  RightUpLeg: [-30, 0, -9],  LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.26, 1.22, 0.28] as V3, Left: [-0.25, 1.16, 0.20] as V3 }, hipsY: -0.04 },
    { t: 0.3,  bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-2, 0, 0], ...STANCE }, hands: { Right: [0.25, 1.0, 0.24] as V3, Left: OFF_HAND }, hipsY: 0 },
  ]);
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
  return buildPoseClip(scene, sk, 'bball_fadeaway', 0.8, accent([
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-32, 0, 8], RightUpLeg: [-32, 0, -8], LeftLeg: [46, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [0.16, 1.16, 0.22], Left: [-0.12, 1.14, 0.24] }, hipsY: -0.11 },   // the gather: the ball into both hands, the knees loaded
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0],  Neck: [-6, 0, 0], LeftUpLeg: [-14, 0, 6], RightUpLeg: [-14, 0, -6], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [0.18, 1.62, 0.16], Left: [-0.16, 1.56, 0.20] }, hipsY: 0.02 },   // the push-off: the legs drive, the ball starts up
    // THE LEAN — the shoulders open back over the hips, the thighs come FORWARD (the knees in front of the body): the
    // release goes up from a body already falling away
    { t: 0.38, bones: { Hips: [0, 0, 0], Spine: [-20, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [-44, 0, 6], RightUpLeg: [-44, 0, -6], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.16, 2.06, 0.10], Left: [-0.20, 1.78, 0.18] }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.10 },
    { t: 0.55, bones: { Hips: [0, 0, 0], Spine: [-16, 0, 0], Neck: [8, 0, 0],  LeftUpLeg: [-30, 0, 6], RightUpLeg: [-30, 0, -6], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.20, 1.94, 0.30], Left: [-0.24, 1.50, 0.24] }, poles: { Right: UP_R }, hipsY: 0.05 },   // the follow-through, still falling
    { t: 0.8,  bones: { Hips: [0, 0, 0], Spine: [12, 0, 0],  Neck: [-4, 0, 0], LeftUpLeg: [-26, 0, 8], RightUpLeg: [-26, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.26, 1.16, 0.30], Left: [-0.26, 1.10, 0.28] }, hipsY: -0.09 },   // the landing: absorbed, square, the arms down the front
  ], 0.38));
}

/** The JUMP HOOK (M5), right-handed: off the seal the opposite knee drives up as the body turns shoulder-on, the ball
 *  sweeps OUT to the side on a straight arm and goes over the top at full extension — the release is the 0.34 s key — while
 *  the off arm is the SHIELD, out across the body at shoulder height between the ball and the defender. Feet-down at 0.72.
 *  The whole point is where the ball is: high and OUT to the side, not on the midline like a jumper. */
const HOOK_KEYS = accent([
  // 2K20 HOOK (owner, 2026-09-17: "hook shots like 2k20"). What the 2K20 hooks have that the first cut did not: the body turns
  // SHOULDER-ON to the rim (the hips ~30° away, the eyes over the shoulder), the ball starts low and BEHIND the far hip and
  // sweeps a WIDE arc out to the side and up to a sky-hook release well above the head, the shield arm across the chest the
  // whole way, and the follow-through carries the wrist toward the rim. The release stays the 0.34 s key, feet-down 0.72
  // (FINISH_RELEASE_KEY_SEC / FINISH_LAND_KEY_SEC); the ball is still OUT to the side at the release (the test's 0.25 m).
  { t: 0,    bones: { Hips: [0, -6, 0], Spine: [12, -4, 0], Neck: [-4, 10, 0], LeftUpLeg: [-26, 0, 16], RightUpLeg: [-26, 0, -16], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.46, 0.86, -0.14] as V3, Left: [-0.30, 1.18, 0.02] as V3 }, hipsY: -0.12 },   // the seal: the ball low and BEHIND the far hip (the windup)
  { t: 0.18, bones: { Hips: [0, -28, 0], Spine: [4, -10, 0], Neck: [-6, 22, 0], LeftUpLeg: [-70, 0, 8], RightUpLeg: [-14, 0, -6], LeftLeg: [66, 0, 0], RightLeg: [18, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.72, 1.32, -0.20] as V3, Left: [-0.50, 1.38, 0.10] as V3 }, poles: { Right: [0.95, -0.25, -0.3] as V3 }, hipsY: 0.02 },   // shoulder-on, the knee up, the ball sweeping WIDE out to the side
  // THE RELEASE — the sky hook: the arm over the top, the ball high above the head and still out on the shooting side, the
  // shield arm across at shoulder height (the elbow between him and the ball), the eyes on the rim over the shoulder
  { t: 0.34, bones: { Hips: [0, -30, 0], Spine: [-4, -12, 5], Neck: [-2, 26, 0], LeftUpLeg: [-74, 0, 8], RightUpLeg: [-8, 0, -6], LeftLeg: [70, 0, 0], RightLeg: [12, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.44, 2.22, 0.00] as V3, Left: [-0.56, 1.46, 0.10] as V3 }, poles: { Right: [0.95, -0.1, -0.2] as V3, Left: [-0.8, 0.2, 0.6] as V3 }, hipsY: 0.06 },
  { t: 0.5,  bones: { Hips: [0, -16, 0], Spine: [2, -6, 0], Neck: [-4, 14, 0], LeftUpLeg: [-40, 0, 10], RightUpLeg: [-18, 0, -8], LeftLeg: [44, 0, 0], RightLeg: [24, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.06, 2.04, 0.38] as V3, Left: [-0.40, 1.30, 0.20] as V3 }, poles: { Right: UP_R }, hipsY: 0.03 },   // the follow-through: the wrist carries toward the rim
  { t: 0.72, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [26, 0, 0], RightLeg: [26, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.26, 1.14, 0.30] as V3, Left: [-0.26, 1.10, 0.28] as V3 }, hipsY: -0.05 },   // feet-down, the arms down the front
], 0.34);
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
  return buildPoseClip(scene, sk, 'bball_pump_fake', 0.5, accent([
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], ...load }, hands: { Right: [0.16, 1.18, 0.24], Left: [-0.12, 1.16, 0.26] }, hipsY: -0.10 },
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-8, 0, 0], ...load }, hands: { Right: [0.18, 1.86, 0.18], Left: [-0.16, 1.78, 0.22] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.09 },   // the ball up to the release — and the FEET STAY DOWN
    { t: 0.28, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-8, 0, 0], ...load }, hands: { Right: [0.18, 1.88, 0.20], Left: [-0.16, 1.80, 0.24] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.09 },   // held there: the sell
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], ...load }, hands: { Right: [0.16, 1.18, 0.24], Left: [-0.12, 1.16, 0.26] }, hipsY: -0.11 },   // back to the chest, still loaded
  ], 0.16, 0.28));
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
const REVERSE_KEYS = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-8, 0, 0], LeftUpLeg: [-8, 0, 4],  RightUpLeg: [-70, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [72, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.60, 0.02] as V3, Left: [-0.26, 1.36, 0.14] as V3 }, hipsY: 0.02 },   // the knee up, the ball rising behind the ear
  { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-4, 0, 4], RightUpLeg: [-78, 0, -4], LeftLeg: [6, 0, 0],  RightLeg: [70, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 2.06, -0.16] as V3, Left: [-0.28, 1.42, 0.10] as V3 }, poles: { Right: [0.85, 0.1, -0.5] as V3 }, hipsY: 0.07 },   // laid BACK: the hand above and BEHIND the head
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-10, 0, 4], RightUpLeg: [-50, 0, -4], LeftLeg: [12, 0, 0], RightLeg: [50, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.94, -0.06] as V3, Left: [-0.26, 1.34, 0.14] as V3 }, poles: { Right: UP_R }, hipsY: 0.04 },
  { t: 0.74, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [26, 0, 0], RightLeg: [26, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.24, 1.12, 0.28] as V3, Left: [-0.24, 1.08, 0.26] as V3 }, hipsY: -0.05 },
], 0.34);
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
const FINGER_ROLL_KEYS: PoseKey[] = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-24, 0, 6], RightUpLeg: [-24, 0, -6], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.07 },
  { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  Neck: [-8, 0, 0],  LeftUpLeg: [-66, 0, 8], RightUpLeg: [-14, 0, -6], LeftLeg: [62, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [0.26, 1.48, 0.40], Left: [-0.18, 1.30, 0.26] }, hipsY: 0.04 },   // the gather off the stride, the knee driving, the ball going OUT not up
  { t: 0.38, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-78, 0, 8], RightUpLeg: [-8, 0, -6],  LeftLeg: [70, 0, 0], RightLeg: [12, 0, 0] }, hands: { Right: [0.28, 2.12, 0.62], Left: [-0.22, 1.36, 0.22] }, poles: { Right: UP_R }, hipsY: 0.10 },   // RELEASE: the arm STRAIGHT and the ball out IN FRONT — rolled, not laid
  { t: 0.54, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-8, 0, 0],  LeftUpLeg: [-50, 0, 8], RightUpLeg: [-12, 0, -6], LeftLeg: [52, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.28, 2.00, 0.58], Left: [-0.22, 1.32, 0.24] }, poles: { Right: UP_R }, hipsY: 0.05 },   // the hand hangs there after it — the follow IS the shot
  { t: 0.78, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: [0.26, 1.14, 0.30], Left: [-0.24, 1.08, 0.26] }, hipsY: -0.05 },
], 0.38);
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
const MIKAN_KEYS = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-20, 0, 6], RightUpLeg: [-20, 0, -6], LeftLeg: [32, 0, 0], RightLeg: [32, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.10, 0.18] as V3, Left: [-0.18, 1.10, 0.18] as V3 }, hipsY: -0.05 },
  { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-14, 0, 0], LeftUpLeg: [-74, 0, 8], RightUpLeg: [-10, 0, -6], LeftLeg: [70, 0, 0], RightLeg: [14, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.20, 1.56, 0.10] as V3, Left: [-0.14, 1.44, 0.14] as V3 }, hipsY: 0.03 },   // the knee drives, the ball up the middle
  { t: 0.22, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  Neck: [-18, 0, 0], LeftUpLeg: [-80, 0, 8], RightUpLeg: [-6, 0, -6],  LeftLeg: [74, 0, 0], RightLeg: [10, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 2.02, 0.06] as V3, Left: [-0.12, 1.50, 0.12] as V3 }, poles: { Right: UP_R }, hipsY: 0.07 },   // RELEASE: high and CLOSE, off the square
  { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],  Neck: [-12, 0, 0], LeftUpLeg: [-52, 0, 8], RightUpLeg: [-14, 0, -6], LeftLeg: [56, 0, 0], RightLeg: [18, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.86, 0.08] as V3, Left: [-0.14, 1.40, 0.14] as V3 }, poles: { Right: UP_R }, hipsY: 0.04 },   // the hand stays up — you are going again
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.18, 1.14, 0.18] as V3, Left: [-0.18, 1.12, 0.18] as V3 }, hipsY: -0.05 },
], 0.22);
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
const UP_UNDER_KEYS = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0],  Neck: [-4, 0, 0],  LeftUpLeg: [-26, 0, 8], RightUpLeg: [-26, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] } as Record<string, Deg3>, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.08 },
  { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0],  Neck: [-16, 0, 0], LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.80, 0.16] as V3, Left: [-0.18, 1.74, 0.18] as V3 }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.01 },   // THE SELL: ball and shoulders up, chin up, heels light
  { t: 0.30, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0],  Neck: [-16, 0, 0], LeftUpLeg: [-14, 0, 6], RightUpLeg: [-14, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.22, 1.84, 0.16] as V3, Left: [-0.18, 1.78, 0.18] as V3 }, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.02 },   // held — he is in the air now
  { t: 0.38, bones: { Hips: [0, 14, 0], Spine: [20, -10, 0], Neck: [-4, 8, 0], LeftUpLeg: [-64, 0, 14], RightUpLeg: [-16, 0, -8], LeftLeg: [52, 0, 0], RightLeg: [28, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.34, 1.10, 0.34] as V3, Left: [-0.06, 1.24, 0.30] as V3 }, hipsY: -0.14 },   // THE DUCK: hips drop, the lead leg steps through under his arm
  { t: 0.46, bones: { Hips: [0, 22, 0], Spine: [8, -14, 0], Neck: [-8, 10, 0], LeftUpLeg: [-72, 0, 12], RightUpLeg: [-10, 0, -8], LeftLeg: [46, 0, 0], RightLeg: [16, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.40, 1.92, 0.26] as V3, Left: [-0.04, 1.30, 0.28] as V3 }, poles: { Right: UP_R }, hipsY: 0.01 },   // RELEASE: extended on the FAR side, under him
  { t: 0.62, bones: { Hips: [0, 20, 0], Spine: [10, -12, 0], Neck: [-6, 8, 0], LeftUpLeg: [-48, 0, 12], RightUpLeg: [-14, 0, -8], LeftLeg: [40, 0, 0], RightLeg: [22, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.38, 1.78, 0.28] as V3, Left: [-0.08, 1.26, 0.28] as V3 }, poles: { Right: UP_R }, hipsY: -0.02 },
  { t: 0.85, bones: { Hips: [0, 10, 0], Spine: [12, -6, 0], Neck: [-4, 4, 0], LeftUpLeg: [-22, 0, 8], RightUpLeg: [-22, 0, -8], LeftLeg: [32, 0, 0], RightLeg: [32, 0, 0] } as Record<string, Deg3>, hands: { Right: [0.26, 1.12, 0.28] as V3, Left: [-0.22, 1.08, 0.26] as V3 }, hipsY: -0.07 },
], 0.16, 0.30, 0.46);
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

// ── DEFENSE-LOOK (2026-09-17): the retreat, the closeout, the sat-down slide ─────────────────────────────────────────
// Authored fallbacks; opponentMotion swaps in the captures (bball_mc_defend_backpedal — CMU 78_24; the hard slides —
// CMU 78_26) on every hoops body. The closeout has no capture: it is short chop steps under a high hand, authored.

/** Backpedal: dropping back with the chest still on the man — low, hands out, feet reaching back in short steps. Loops. */
export function buildDefendBackpedal(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands = { Left: [-0.32, 1.02, 0.26] as V3, Right: [0.32, 1.02, 0.26] as V3 };
  const key = (t: number, lead: Deg3, trail: Deg3, leadKnee: number, trailKnee: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [24, 0, 0] as Deg3, LeftUpLeg: lead, RightUpLeg: trail, LeftLeg: [leadKnee, 0, 0] as Deg3, RightLeg: [trailKnee, 0, 0] as Deg3 }, hands, hipsY: -0.10 });
  return buildPoseClip(scene, sk, 'bball_defend_backpedal', 0.6, [
    key(0,    [-30, 0, 10], [-8, 0, -10], 44, 18),   // left leg under, right foot reaching back
    key(0.3,  [-8, 0, 10],  [-30, 0, -10], 18, 44),  // …and the other
    key(0.6,  [-30, 0, 10], [-8, 0, -10], 44, 18),
  ]);
}

/** Closeout: the last two metres on a catch — chest up, one hand HIGH at the shooter's release, feet chopping. Loops. */
export function buildCloseout(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands = { Left: [-0.24, 1.50, 0.30] as V3, Right: [0.30, 2.05, 0.24] as V3 };
  const key = (t: number, lead: Deg3, trail: Deg3, leadKnee: number, trailKnee: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [10, 0, -3] as Deg3, LeftUpLeg: lead, RightUpLeg: trail, LeftLeg: [leadKnee, 0, 0] as Deg3, RightLeg: [trailKnee, 0, 0] as Deg3 }, hands, hipsY: -0.06 });
  return buildPoseClip(scene, sk, 'bball_closeout', 0.4, [
    key(0,   [-26, 0, 8], [-10, 0, -8], 34, 16),
    key(0.2, [-10, 0, 8], [-26, 0, -8], 16, 34),
    key(0.4, [-26, 0, 8], [-10, 0, -8], 34, 16),
  ]);
}

/** The hard slide: sat down — hips a hand lower than the stance slide, thighs wider, chest tall. Loops. */
export function buildDefendSlideHard(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const hands = { Left: [-0.42, 0.98, 0.34] as V3, Right: [0.42, 0.98, 0.34] as V3 };
  const key = (t: number, roll: number, lead: Deg3, trail: Deg3, hipsY: number) => ({ t, bones: { Hips: [0, 0, roll * s] as Deg3, Spine: [26, 0, -5 * s] as Deg3, LeftUpLeg: lead, RightUpLeg: trail, LeftLeg: [52, 0, 0] as Deg3, RightLeg: [52, 0, 0] as Deg3 }, hands, hipsY });
  return buildPoseClip(scene, sk, `bball_defend_slide_hard_${dir}`, 0.5, [
    key(0, 5, [-40, 0, 30], [-40, 0, -30], -0.18), key(0.25, 10, [-48, 0, 40], [-32, 0, -18], -0.20), key(0.5, 5, [-40, 0, 30], [-40, 0, -30], -0.18),
  ]);
}

// ── THE ARM BEHIND THE BACK (owner, 2026-09-17: "fix the arm behind the back glitch") ────────────────────────────────
// Every bump, stagger and poster ride on a hoops body played `karate_hit_react` — and the hero and the rivals wear the
// CAPTURED one (karate_mc_hit_react, CMU 80_10), a FIGHTER's flinch that throws both arms behind the body. The smoothness
// recorder found every behind-the-back episode in six 3v3 possessions on that one clip. A basketball body meets contact
// chest back, hips back, the hands coming UP IN FRONT (a ball to protect, a body to brace against), a stagger step.
// HOOPS-DEPTH S8 (2026-09-23): the hands were set 0.47 m out from a 0.49 m arm, so the IK straightened both arms into a reach —
// both elbows 175° on 177 of 199 frames of a live 3v3 bump (body smoke). The brace is the forearms up, elbows BENT, the hands in
// close in front of the chest.
export function buildContactReact(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const front = { Left: [-0.6, -0.7, 0.3] as V3, Right: [0.6, -0.7, 0.3] as V3 };
  return buildPoseClip(scene, sk, 'bball_contact_react', 0.32, [
    { t: 0,    bones: { Hips: [0, 0, 0] as Deg3,   Spine: [4, 0, 0] as Deg3,   Neck: [-4, 0, 0] as Deg3, LeftUpLeg: [-18, 0, 6] as Deg3, RightUpLeg: [-10, 0, -6] as Deg3, LeftLeg: [26, 0, 0] as Deg3, RightLeg: [18, 0, 0] as Deg3 }, hands: { Left: [-0.26, 1.18, 0.22] as V3, Right: [0.26, 1.18, 0.22] as V3 }, poles: front },
    { t: 0.12, bones: { Hips: [-10, 0, 0] as Deg3, Spine: [-18, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3, LeftUpLeg: [-30, 0, 8] as Deg3, RightUpLeg: [8, 0, -6] as Deg3,   LeftLeg: [40, 0, 0] as Deg3, RightLeg: [22, 0, 0] as Deg3 }, hands: { Left: [-0.28, 1.36, 0.26] as V3, Right: [0.28, 1.36, 0.26] as V3 }, poles: front, hipsY: -0.04 },   // hit: chest back, hands up in front, a step
    { t: 0.32, bones: { Hips: [-4, 0, 0] as Deg3,  Spine: [-6, 0, 0] as Deg3,  Neck: [2, 0, 0] as Deg3,  LeftUpLeg: [-20, 0, 6] as Deg3, RightUpLeg: [-8, 0, -6] as Deg3,  LeftLeg: [28, 0, 0] as Deg3, RightLeg: [18, 0, 0] as Deg3 }, hands: { Left: [-0.27, 1.22, 0.24] as V3, Right: [0.27, 1.22, 0.24] as V3 }, poles: front },   // settling
  ]);
}

// THE CATCH (HOOPS-10PHASE-2 phase 6: "passing with catch/receive animations"). Every pass already lands the ball
// exactly on the catching hand (gatherBallToHand) with no body beat to go with it — the same snap-to-hand whether
// the ball arrived from a chest pass, a bounce, or a call-for-the-ball throwback. A real catch is hands OUT to meet
// it, then IN to secure it against the body — the opposite shape from the contact react above (that one recoils
// FROM the body; this one reaches AWAY then draws back TOWARD it). Short and small on purpose: it plays on top of
// whatever stance the receiver is already in (a cut, a stand-still, a close-out), so it has to read as a beat, not
// override the whole pose.
export function buildCatchBall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const reach = { Left: [-0.5, -0.4, -0.2] as V3, Right: [0.5, -0.4, -0.2] as V3 };   // elbows out and slightly forward — a target, not a guard
  return buildPoseClip(scene, sk, 'bball_catch', 0.22, [
    { t: 0,    bones: { Hips: [0, 0, 0] as Deg3,  Spine: [2, 0, 0] as Deg3,  Neck: [-2, 0, 0] as Deg3 }, hands: { Left: [-0.38, 1.28, 0.42] as V3, Right: [0.38, 1.28, 0.42] as V3 }, poles: reach },   // hands OUT to meet the ball
    { t: 0.1,  bones: { Hips: [-4, 0, 0] as Deg3, Spine: [-8, 0, 0] as Deg3, Neck: [4, 0, 0] as Deg3 },  hands: { Left: [-0.24, 1.08, 0.26] as V3, Right: [0.24, 1.08, 0.26] as V3 }, poles: reach, hipsY: -0.02 },   // secured: drawn IN to the chest, a small absorb
    { t: 0.22, bones: { Hips: [0, 0, 0] as Deg3,  Spine: [0, 0, 0] as Deg3,  Neck: [0, 0, 0] as Deg3 },  hands: { Left: OFF_HAND, Right: BALL_HAND } },   // settle into the ordinary carry — the body's own tree takes it from here
  ]);
}

// ── ACROBATIC LAYUPS (owner, 2026-09-18: "better layups … better contact layups, acrobatic layups") ──────────────────
// Three finishes the vocabulary did not have, each defined by ONE tell the eye can name at a glance:
//   SCOOP  — the contact layup: the ball comes from the HIP, underhand, and is rolled up past a hand that is waiting high;
//            the body leans back under it. The tell is the palm: UP, the arm from below.
//   SPIN   — the acrobatic layup off a drive across the rim's face: the hips turn a full circle in the air with the ball
//            tucked at the chest, and the finish comes out of the turn facing the iron. The tell is the turn.
//   HANG   — the double-clutch layup against a shot blocker: the ball goes up as if to finish, is pulled DOWN to the chest
//            while the blocker's hand passes, and goes back up late. The tell is the clutch — and the late release.
// The release key lands on the meter's green through planFinish (FINISH_RELEASE_KEY_SEC); the modes hop the root
// (FINISH_HOP_APEX) and ride the clip to the landing key.
const SCOOP_POLE: V3 = [0.8, -0.55, -0.1];   // the underhand elbow: out and DOWN, never up over the ball
const SCOOP_KEYS: PoseKey[] = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  Neck: [-8, 0, 0],  LeftUpLeg: [-62, 0, 8], RightUpLeg: [-6, 0, -6], LeftLeg: [62, 0, 0], RightLeg: [10, 0, 0] }, hands: { Right: [0.22, 0.96, 0.50], Left: [-0.26, 1.30, 0.22] }, poles: { Right: SCOOP_POLE }, hipsY: 0.02 },   // the scoop starts LOW and forward
  { t: 0.32, bones: { Hips: [0, 0, 0], Spine: [-12, 0, 0], Neck: [-12, 0, 0], LeftUpLeg: [-80, 0, 8], RightUpLeg: [6, 0, -6],  LeftLeg: [74, 0, 0], RightLeg: [8, 0, 0] },  hands: { Right: [0.20, 1.98, 0.52], Left: [-0.28, 1.36, 0.20] }, poles: { Right: SCOOP_POLE }, hipsY: 0.05 },   // the release: palm up, arm from below, leaning back
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0],  LeftUpLeg: [-52, 0, 8], RightUpLeg: [-10, 0, -6], LeftLeg: [54, 0, 0], RightLeg: [14, 0, 0] }, hands: { Right: [0.22, 1.90, 0.38], Left: [-0.26, 1.32, 0.22] }, poles: { Right: SCOOP_POLE }, hipsY: 0.02 },
  { t: 0.72, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [28, 0, 0], RightLeg: [28, 0, 0] }, hands: { Right: [0.26, 1.14, 0.30], Left: [-0.24, 1.08, 0.26] }, hipsY: -0.05 },
], 0.32);
export function buildScoopLayup(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_layup_scoop', 0.72, SCOOP_KEYS);
  return buildPoseClip(scene, sk, 'bball_layup_scoop_left', 0.72, SCOOP_KEYS.map(mirrorKey));
}

/** The spin: a full turn of the HIPS (the root bone — the whole body turns with it) through the hop, the ball tucked in two
 *  hands at the chest, out of the turn facing the iron with the ball hand up. Yaw is keyed in 120° steps so the quaternion
 *  interpolation takes the short way round each time. */
/**
 * HANDS THAT RIDE A SPIN ARE SHOULDER-RELATIVE (rig sweep, 2026-09-18).
 *
 * These keys turn the Hips a full 360, but `hands` targets are ABSOLUTE FROM THE ROOT — they
 * do not turn with the body. So the shoulder swings around a target that stays put, and partway
 * through the turn it arrives on top of it: measured, the left shoulder-to-hand distance fell to
 * 0.08 m at t=0.37 and the elbow shut to 14 degrees, the forearm folded inside the bicep on both
 * the right and mirrored left clips.
 *
 * `handsRel` is measured FROM THE POSED SHOULDER, so it travels with the turn, and its LENGTH is
 * the elbow angle (0.54 = straight, 0.46 ~117, 0.42 ~102). The tuck and the off hand use it; the
 * RIGHT hand at the release keeps an absolute target, because reaching for the rim is a reach at
 * a fixed thing in the world and is supposed to stay where the rim is.
 */
const SPIN_LAYUP_KEYS: PoseKey[] = accent([
  { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [12, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  { t: 0.12, bones: { Hips: [0, 120, 0], Spine: [6, 0, 0],  Neck: [-6, 0, 0],  LeftUpLeg: [-52, 0, 8], RightUpLeg: [-48, 0, -8], LeftLeg: [68, 0, 0], RightLeg: [64, 0, 0] }, handsRel: { Right: [0.09, -0.08, 0.41], Left: [-0.09, -0.08, 0.41] }, hipsY: 0.02 },   // tucked, both hands on the ball — rel, so the tuck rides the turn; x pulls each wrist toward the MIDLINE (it pushed them apart, and a tuck is two hands on one ball)
  { t: 0.24, bones: { Hips: [0, 240, 0], Spine: [2, 0, 0],  Neck: [-6, 0, 0],  LeftUpLeg: [-56, 0, 8], RightUpLeg: [-44, 0, -8], LeftLeg: [70, 0, 0], RightLeg: [60, 0, 0] }, handsRel: { Right: [0.09, 0.02, 0.41], Left: [-0.09, 0.02, 0.41] }, hipsY: 0.04 },
  { t: 0.34, bones: { Hips: [0, 360, 0], Spine: [-8, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-76, 0, 8], RightUpLeg: [-8, 0, -6],  LeftLeg: [70, 0, 0], RightLeg: [12, 0, 0] }, hands: { Right: [0.20, 2.02, 0.18] }, handsRel: { Left: [0.14, -0.06, 0.40] }, poles: { Right: UP_R }, hipsY: 0.05 },   // out of the turn: the release — the rim hand is a world reach, the off hand rides the body
  { t: 0.54, bones: { Hips: [0, 360, 0], Spine: [-2, 0, 0], Neck: [-6, 0, 0],  LeftUpLeg: [-48, 0, 8], RightUpLeg: [-12, 0, -6], LeftLeg: [50, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.22, 1.90, 0.14] }, handsRel: { Left: [0.14, -0.10, 0.40] }, poles: { Right: UP_R }, hipsY: 0.02 },
  { t: 0.76, bones: { Hips: [0, 360, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [28, 0, 0], RightLeg: [28, 0, 0] }, hands: { Right: [0.26, 1.14, 0.30], Left: [-0.24, 1.08, 0.26] }, hipsY: -0.05 },
], 0.34);
export function buildSpinLayup(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_layup_spin', 0.76, SPIN_LAYUP_KEYS);
  return buildPoseClip(scene, sk, 'bball_layup_spin_left', 0.76, SPIN_LAYUP_KEYS.map(mirrorKey));
}

/** The hang / double clutch: up, DOWN to the chest while the blocker's hand passes, back up late. The longest finish
 *  after the up-and-under (release 0.5, feet down 0.9) — the hang is what it is buying. */
const HANG_LAYUP_KEYS: PoseKey[] = accent([
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-22, 0, 6], RightUpLeg: [-22, 0, -6], LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] }, hands: { Right: BALL_HAND, Left: OFF_HAND }, hipsY: -0.06 },
  { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0],  LeftUpLeg: [-72, 0, 8], RightUpLeg: [-6, 0, -6], LeftLeg: [68, 0, 0], RightLeg: [10, 0, 0] }, hands: { Right: [0.22, 1.90, 0.20], Left: [-0.28, 1.34, 0.20] }, poles: { Right: UP_R }, hipsY: 0.03 },   // up, as if to finish
  { t: 0.32, bones: { Hips: [0, 0, 0], Spine: [-14, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-78, 0, 8], RightUpLeg: [0, 0, -6],  LeftLeg: [72, 0, 0], RightLeg: [8, 0, 0] },  hands: { Right: [0.18, 1.30, 0.28], Left: [-0.10, 1.28, 0.30] }, hipsY: 0.05 },   // THE CLUTCH: pulled down to the chest, both hands, arched back
  { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], Neck: [-12, 0, 0], LeftUpLeg: [-70, 0, 8], RightUpLeg: [4, 0, -6],  LeftLeg: [66, 0, 0], RightLeg: [10, 0, 0] }, hands: { Right: [0.24, 2.06, 0.18], Left: [-0.28, 1.40, 0.16] }, poles: { Right: UP_R }, hipsY: 0.04 },   // back up, late: the release
  { t: 0.66, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-8, 0, 0],  LeftUpLeg: [-46, 0, 8], RightUpLeg: [-12, 0, -6], LeftLeg: [50, 0, 0], RightLeg: [16, 0, 0] }, hands: { Right: [0.24, 1.90, 0.14], Left: [-0.26, 1.34, 0.22] }, poles: { Right: UP_R }, hipsY: 0.01 },
  { t: 0.9,  bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0],  LeftUpLeg: [-18, 0, 6], RightUpLeg: [-18, 0, -6], LeftLeg: [28, 0, 0], RightLeg: [28, 0, 0] }, hands: { Right: [0.26, 1.14, 0.30], Left: [-0.24, 1.08, 0.26] }, hipsY: -0.05 },
], 0.18, 0.5);
export function buildHangLayup(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_layup_hang', 0.9, HANG_LAYUP_KEYS);
  return buildPoseClip(scene, sk, 'bball_layup_hang_left', 0.9, HANG_LAYUP_KEYS.map(mirrorKey));
}

// ── THE POST GAME (owner, 2026-09-18) ────────────────────────────────────────────────────────────────────────────────
/** The SHIMMY: out of the seal, the ball pulled tight to the chest in both hands, the shoulders sell a turn one way,
 *  then the other, then back — the hips and the spine's roll swing with them, the knees stay loaded, the feet never
 *  move (no travel: the mode's plan has no legs). It ends set for the fade (the fade's first key is the chest hold). */
export function buildShimmy(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Record<string, Deg3> = { LeftUpLeg: [-28, 0, 18], RightUpLeg: [-28, 0, -18], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] };
  const key = (t: number, yaw: number, roll: number, hipsY: number): PoseKey => ({
    t, bones: { Hips: [0, yaw, 0], Spine: [10, -yaw * 0.6, roll], Neck: [-6, yaw * 0.4, 0], ...base },
    hands: { Right: [0.16 + yaw * 0.002, 1.16, 0.22], Left: [-0.12 + yaw * 0.002, 1.14, 0.24] }, hipsY,
  });
  return buildPoseClip(scene, sk, 'bball_shimmy', 0.38, [key(0, 0, 0, -0.10), key(0.1, 14, 7, -0.11), key(0.2, -14, -7, -0.11), key(0.3, 9, 4, -0.10), key(0.38, 0, 0, -0.10)]);
}
/** The DROP STEP, right-side: from the seal (back to the basket, the ball low on the right) the right foot swings AROUND
 *  toward the iron, the ball swept low across the body into both hands at the chest — set for the layup that follows (the
 *  mode walks the step). 0.34 s (DROP_STEP_SEC).
 *  HOOPS MOTION phase 3d (one owner per body): THE ROOT OWNS THE TURN. The clip turned the hips 130° (Hips yaw −70 → −130, the
 *  chest and neck with them) while the mode's rim slew turned the root toward the iron — the gather is a shot, and a shot squares
 *  to the rim (OneVOneMode: slewYaw at FACE_RIM_RATE while `shooting`). Measured on the probe's drop step (rG, 5 of 5 windows):
 *  the two turns cancelled, the world hips held still for the whole step (19°) while the root went 109° round under them, then
 *  whipped 153° in five frames into the layup gather (hip-yaw seam 41° in one frame; base2 34°). No yaw key now: the hips ride
 *  the root through the step, and the gather takes them over where they are. */
const DROP_STEP_KEYS: PoseKey[] = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-26, 0, 20], RightUpLeg: [-26, 0, -20], LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.44, 0.92, 0.04], Left: [-0.32, 1.24, -0.24] }, poles: { Left: [-0.9, 0.0, -0.3] }, hipsY: -0.10 },
  { t: 0.17, bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-18, 0, 12], RightUpLeg: [-56, 0, -14], LeftLeg: [30, 0, 0], RightLeg: [46, 0, 0] }, hands: { Right: [0.20, 0.98, 0.30], Left: [-0.06, 1.02, 0.32] }, hipsY: -0.08 },   // the step swings round, the ball low across
  { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-30, 0, 8],  RightUpLeg: [-30, 0, -8],  LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] }, hands: { Right: [0.16, 1.18, 0.24], Left: [-0.12, 1.16, 0.26] }, hipsY: -0.10 },   // loaded, the ball at the chest (the root has turned him to the iron)
];
export function buildDropStep(scene: Scene, sk: Skeleton, side: 'left' | 'right' = 'right'): AnimationGroup | null {
  if (side === 'right') return buildPoseClip(scene, sk, 'bball_drop_step', 0.34, DROP_STEP_KEYS);
  return buildPoseClip(scene, sk, 'bball_drop_step_left', 0.34, DROP_STEP_KEYS.map(mirrorKey));
}

// ── HOOPS MOTION phase 4c (2026-09-29, plan §4.1–4.7): THE CROSSING CLIPS, v2 — THE BALL LEADS, THE CLIP FOLLOWS ──────────────────
//
// Phase 4b gave the ball its path (anim/handlePaths, played by the carry's runMove) and put the carry on a hand only while that hand
// touches the ball (the contact schedule: weight 1 on the ball, faded over 0.06 s either side, the clip's arm between). The clips it
// played over those paths were phase 1's three-key poses and a capture, keyed nowhere near the ball: every release and every catch the
// arm snapped between the clip's hand and the ball inside the 0.06 s fade — the ball arm's forearm took the pops (4b's probe: size-up
// LeftForeArm 5 → 68 pops, yoyo 3.4 → 12, the Shammgod 22.4 a window; rig LeftForeArm is the athlete's right on the mirrored rig).
// A v2 clip is BUILT FROM ITS PATH, on each body: the carry's own stance on this body (its fitted palm — carryStanceAtBind), the path at
// pace 1 on that stance (its times stretched by the stroke, as the carry plays it: strokeStretch), and every hand key that says 'on' is
// the path's hand target at that moment (handsBody: this body's metres, the point the carry reaches for). Between contacts the hands are
// authored — the push hand's follow-through, the catch hand coming to the ball — and the torso, the legs and the hips carry the move
// (the plan's per-move figures). Authored right hand first; the other side is mirrorKey of the same keys.

type HandSpec = 'on' | V3 | { near: number; off: V3 };
/** A v2 key, right hand first, at the path's own time (s, the default stance at pace 1 — stretched on a body with a longer stroke). A hand is
 *  'on' the ball (the path's hand target at this moment), `{ near, off }` the path's hand target at time `near` moved by `off` (this body's
 *  metres: a hand arriving at, or leaving, a contact), or a free pose in reference proportions (`hands`). */
export interface V2Key {
  t: number; bones: Record<string, Deg3>; hipsY: number; R: HandSpec; L: HandSpec; poles?: PoseKey['poles']; hold?: boolean;
  /** The ankles where they END UP (after this key's hipsY; reference metres, body frame — poseClip `feet`, re-expressed per body by its
   *  legs): a leg keyed here is solved to its ankle, the knee on the planter's pole. For a move whose hips go further down than its legs'
   *  `bones` can follow (the between-the-legs: keyed by bones at hipsY −0.27 its trail foot went 0.13 m through the floor). */
  feet?: { Left?: V3; Right?: V3 };
}

/**
 * The dribble stance the hoops carry fits on this body — ballCarry.mountBallCarry's: the stroke's top (P) raised off the arm's lowest reach
 * (shoulder − arm length) plus the elbow headroom and the follow depth (Dribble.fitDribbleToReach), read here at BIND, where every clip is
 * built. The carry reads it at its mount (the spawn pose); the two agree to the pose's difference.
 */
export function carryStanceAtBind(sk: Skeleton): HandleStance {
  const hipsN = findBone(sk, 'Hips')?.getTransformNode() ?? null;
  const arm = armChain(sk, 'Right') ?? armChain(sk, 'Left');
  const d = HOOPS_DRIBBLE;
  if (!hipsN || !arm) return { P: d.palmY, r: d.ballR, S: d.side, F: d.forward };
  const bf = bindFrame(sk);
  const saved = [...bf.bind.keys()].map((n) => [n, n.position.clone(), n.rotationQuaternion?.clone() ?? null] as const);
  for (const [n, t] of bf.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  const top = (hipsN.parent as TransformNode | null) ?? hipsN;
  const walk = (n: TransformNode): void => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); };
  walk(top);
  const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), ha = arm.hand.getAbsolutePosition();
  const armLen = sh.subtract(el).length() + el.subtract(ha).length();
  const lowY = sh.y - top.getAbsolutePosition().y - armLen;
  for (const [n, p, q] of saved) { n.position.copyFrom(p); n.rotationQuaternion = q; }
  walk(top);
  const fit = fitDribbleToReach(d, lowY);
  return { P: fit.palmY, r: fit.ballR, S: fit.side, F: fit.forward };
}

/**
 * The elbow pole of a hand ON the path (a key's 'on' or `{ near }` hand, unless the key names its own): the carry's move reach
 * (ballCarry.BALL_ELBOW_POLE — the same numbers, handleV2.test pins them; not imported: the carry is not in the clips' import closure). The
 * carry reaches that hand for the ball at weight 1 with that pole, and hands it back to the clip over 0.06 s either side of a contact:
 * a clip elbow solved on the default pole (out and back) sat 20–48° round the shoulder→hand line from the carry's, and the hand-over swung
 * it at the carry's swing limit (720°/s) — 4c's probe's arm pops at every push and catch. Body frame, x toward the arm's own side.
 */
export const V2_BALL_POLE: V3 = [0.45, -0.3, -0.85];
/** The v2 keys resolved on a body: its path (pace 1, right hand first), and each key's hands placed (see V2Key). */
export function handleV2Keys(move: PathMove, keys: readonly V2Key[], stance: HandleStance): { path: HandlePath; keys: PoseKey[] } {
  const path = pathFor(move, 'right', 1, stance);
  if (!path) throw new Error(`no path for ${move}`);
  const k = strokeStretch(stance);
  const top = (b: { x: number; y: number; z: number }): V3 => [b.x, b.y + stance.r, b.z];
  const kinds: Record<'Right' | 'Left', 'on' | 'near' | 'free'>[] = [];
  const onAt = (h: 'right' | 'left', t: number): V3 | null => { const s = pathAt(path, t); return s.contact === h ? top(s.ball) : s.reach[h] > 0 && s.handTarget[h] ? [s.handTarget[h]!.x, s.handTarget[h]!.y, s.handTarget[h]!.z] : null; };
  const out = keys.map((key): PoseKey => {
    kinds.push({ Right: key.R === 'on' ? 'on' : Array.isArray(key.R) ? 'free' : 'near', Left: key.L === 'on' ? 'on' : Array.isArray(key.L) ? 'free' : 'near' });
    const t = Math.min(path.duration, key.t * k);
    const pk: PoseKey = { t, bones: key.bones, hipsY: key.hipsY, kneesFront: true };   // the knees on the foot planter's pole (poseClip kneesFront)
    if (key.poles) pk.poles = key.poles;
    if (key.hold) pk.hold = true;
    // the ankles in the final pose: solved with the hips at bind, then hipsY lowers the whole body — so the target is raised by it here
    if (key.feet) { pk.feet = {}; for (const side of ['Left', 'Right'] as const) { const f = key.feet[side]; if (f) pk.feet[side] = [f[0], f[1] - key.hipsY, f[2]]; } }
    for (const [side, spec] of [['Right', key.R], ['Left', key.L]] as const) {
      const h = side === 'Right' ? 'right' : 'left';
      // the pole: the key's own, else the carry's for a hand on the path (V2_BALL_POLE), else poseClip's default (a free pose)
      if (spec === 'on' || !Array.isArray(spec)) { if (!key.poles?.[side]) (pk.poles = { ...(pk.poles ?? {}) })[side] = side === 'Right' ? V2_BALL_POLE : [-V2_BALL_POLE[0], V2_BALL_POLE[1], V2_BALL_POLE[2]]; }
      if (spec === 'on') {
        const s = pathAt(path, t);
        if (s.contact !== h && !(s.reach[h] > 0)) throw new Error(`${move} @${key.t}: the ${h} hand is not on the ball`);
        (pk.handsBody ??= {})[side] = s.contact === h ? top(s.ball) : [s.handTarget[h]!.x, s.handTarget[h]!.y, s.handTarget[h]!.z];
      } else if (Array.isArray(spec)) (pk.hands ??= {})[side] = spec as V3;
      else { const b = top(pathAt(path, Math.min(path.duration, spec.near * k)).ball); (pk.handsBody ??= {})[side] = [b[0] + spec.off[0], b[1] + spec.off[1], b[2] + spec.off[2]]; }
    }
    return pk;
  });
  return { path, keys: densifyV2(out, kinds, onAt) };
}
/**
 * THE ARM STAYS ON THE CARRY'S SOLVE BETWEEN TWO KEYS (phase 4c): two keys further apart than V2_KEY_GAP_SEC (0.1 s) get keys in between — the
 * torso, the legs and hipsY at their straight-line values; a hand on the path at both ends ('on' / `{ near }`) placed on it ('on' at both:
 * the path's own target at that moment; else the straight line between the two) with the carry's pole; a free hand at both ends at its
 * straight-line pose; any other arm not keyed there. Between two keys the clip's arm is its joint-space cubic, which does not keep the
 * elbow where a solve toward the same hand puts it: the carry takes the hand over for a catch and gives it back after a push over 0.06 s,
 * and at the between-the-legs' and the Shammgod's catches the cubic's elbow sat 20–28° round the shoulder→hand line from the carry's.
 */
export const V2_KEY_GAP_SEC = 0.1;
function densifyV2(keys: PoseKey[], kinds: Record<'Right' | 'Left', 'on' | 'near' | 'free'>[], onAt: (h: 'right' | 'left', t: number) => V3 | null): PoseKey[] {
  const out: PoseKey[] = [];
  const lerp3 = (a: readonly number[], b: readonly number[], u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i], b = keys[i + 1]; out.push(a);
    if (!b) continue;
    const gap = b.t - a.t; if (gap <= V2_KEY_GAP_SEC) continue;
    const n = Math.ceil(gap / V2_KEY_GAP_SEC) - 1;
    for (let j = 1; j <= n; j++) {
      const u = j / (n + 1), t = a.t + gap * u;
      const bones: Record<string, Deg3> = {};
      const ab = a.bones ?? {}, bb = b.bones ?? {};
      for (const name of new Set([...Object.keys(ab), ...Object.keys(bb)])) bones[name] = lerp3(ab[name] ?? bb[name], bb[name] ?? ab[name], u);
      const k: PoseKey = { t, bones, hipsY: (a.hipsY ?? 0) + ((b.hipsY ?? 0) - (a.hipsY ?? 0)) * u, kneesFront: true };
      for (const side of ['Left', 'Right'] as const) { const fa = a.feet?.[side], fb = b.feet?.[side]; if (fa && fb) (k.feet ??= {})[side] = lerp3(fa, fb, u); }   // (raised by each key's hipsY already: the straight line between them)
      for (const side of ['Right', 'Left'] as const) {
        const ka = kinds[i][side], kb = kinds[i + 1][side];
        if (ka !== 'free' && kb !== 'free') {
          const on = ka === 'on' && kb === 'on' ? onAt(side === 'Right' ? 'right' : 'left', t) : null;
          (k.handsBody ??= {})[side] = on ?? lerp3(a.handsBody![side]!, b.handsBody![side]!, u);
          (k.poles ??= {})[side] = a.poles?.[side] ?? b.poles?.[side];
        } else if (ka === 'free' && kb === 'free') (k.hands ??= {})[side] = lerp3(a.hands![side]!, b.hands![side]!, u);
      }
      out.push(k);
    }
  }
  return out;
}
/** Build a v2 handle clip on this body (its own stance and stroke), right hand first; `mirror` the other side (mirrorKey). Smoothed (a
 *  joint-space cubic), no prefilter (plan §4 "moving to v2"). */
export function buildHandleV2(scene: Scene, sk: Skeleton, name: string, move: PathMove, keys: readonly V2Key[], mirror: boolean): AnimationGroup | null {
  const { path, keys: pose } = handleV2Keys(move, keys, carryStanceAtBind(sk));
  return buildPoseClip(scene, sk, name, path.duration, mirror ? pose.map(mirrorKey) : pose, { smooth: true, prefilter: 0, periodic: false });
}

// the legs (reference degrees, as the phase-1 handle clips key them): the dribble stance, loaded, wide (a cross), the right foot pushing
const LEGS = {
  stance: STANCE,
  load: { LeftUpLeg: [-28, 0, 10], RightUpLeg: [-28, 0, -10], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] } as Record<string, Deg3>,
  wide: { LeftUpLeg: [-34, 0, 18], RightUpLeg: [-34, 0, -18], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0] } as Record<string, Deg3>,
  pushR: { LeftUpLeg: [-26, 0, 10], RightUpLeg: [-32, 0, -16], LeftLeg: [38, 0, 0], RightLeg: [44, 0, 0] } as Record<string, Deg3>,
  low: { LeftUpLeg: [-40, 0, 18], RightUpLeg: [-40, 0, -18], LeftLeg: [52, 0, 0], RightLeg: [52, 0, 0] } as Record<string, Deg3>,
};
/** The torso: hips yaw (+ turns the RIGHT shoulder forward, i.e. toward the body's left), spine pitch and counter-yaw, the neck. */
const torso = (yaw: number, pitch: number, spineYaw = 0, neck: Deg3 = [-4, 0, 0]): Record<string, Deg3> => ({ Hips: [0, yaw, 0], Spine: [pitch, spineYaw, 0], Neck: neck });
const OFF_R: V3 = [0.25, 1.0, 0.12];   // the right hand relaxed, once the ball has gone to the left (OFF_HAND's mirror)
/**
 * CROSSOVER (plan §4.1): 0.42 s at pace 1 — the push 0–0.08, the floor at 0.19, the catch 0.30–0.42. The outside (right) foot pushes, the
 * hips swing 24° toward the new side at the crossing and the body is down 0.12 there; the push hand follows through toward the midline,
 * the catch hand comes low to meet the ball at (−0.32, 0.60, 0.26) — the body goes down 0.16 to it: standing, the hand cannot reach that
 * low (handleV2.test: every contact key within 0.05 m of the carry's target on the hero and the female kit). Ends square (no hip yaw: the
 * loop's own seam). Every low contact below (the momentum cross's catch, the between's, the behind-the-back's, the double cross's two, the
 * Shammgod's push and catch, the in-and-out's) is reached the same way: hips down, the chest over.
 */
const CROSSOVER_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: 'on', L: OFF_HAND },
  { t: 0.08, bones: { ...torso(10, 17, -5), ...LEGS.pushR }, hipsY: -0.07, R: 'on', L: { near: 0.30, off: [0.02, 0.16, -0.10] } },
  { t: 0.19, bones: { ...torso(24, 22, -12), ...LEGS.wide }, hipsY: -0.12, R: { near: 0.08, off: [0.04, 0.10, -0.06] }, L: { near: 0.30, off: [0.0, 0.06, -0.04] } },
  { t: 0.30, bones: { ...torso(14, 26, -7), ...LEGS.low }, hipsY: -0.16, R: [0.24, 0.94, 0.16], L: 'on' },   // down to the low catch (the hand cannot reach it standing)
  { t: 0.42, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: OFF_R, L: 'on' },
];
/** MOMENTUM CROSS (plan §4.2): the crossover at pace — 0.45 s at pace 1 (the turbo's 1.25 plays the plan's 0.36 s), the floor 0.50 ahead,
 *  the catch wide at (−0.40, 0.62, 0.36); the body lower and turned further (it rides DribbleController.momentumCross's wide cut). */
const MOMENTUM_CROSS_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: 'on', L: OFF_HAND },
  { t: 0.09, bones: { ...torso(12, 20, -6), ...LEGS.pushR }, hipsY: -0.08, R: 'on', L: { near: 0.32, off: [0.02, 0.16, -0.10] } },
  { t: 0.20, bones: { ...torso(28, 26, -14), ...LEGS.wide }, hipsY: -0.14, R: { near: 0.09, off: [0.04, 0.10, -0.06] }, L: { near: 0.32, off: [0.0, 0.06, -0.04] } },
  { t: 0.32, bones: { ...torso(16, 30, -8), ...LEGS.low }, hipsY: -0.19, R: [0.24, 0.94, 0.16], L: 'on' },
  { t: 0.45, bones: { ...torso(0, 15), ...LEGS.stance }, hipsY: -0.05, R: OFF_R, L: 'on' },
];
/**
 * BETWEEN THE LEGS (plan §4.3): 0.48 s — the push down between 0–0.10, the floor at 0.19 inside the stance, the catch behind the lead knee
 * 0.30–0.48. A SPLIT STANCE (plan: the lead foot forward, the trail foot back): the trail (right) foot steps BACK to z −0.20 (0–0.10, lifted:
 * a step, not a slide), then the lead (catch-side, left) foot steps FORWARD to z +0.25 (0.10–0.16) — one foot in the air at a time, both
 * planted before the floor contact; after the catch the lead comes back (0.30–0.40) and then the trail (0.40–0.48). Keyed as ankles (V2Key.feet), the knees solved to them.
 * The floor point (z ≈ 0.06) sits between the two ankles' line and the toes' — the probe's between (a floor contact inside the feet); 4c's
 * first feet cut kept the lead at the stance and read 1/5 there. Hips −0.33 at the floor: ≥ 0.15 m under the dribble loops' own −0.15 (the
 * probe reads the drop against the 300 ms before the move: the bones-keyed cut at −0.27 read 0.108, and its trail foot went 0.13 m through
 * the floor), the chest pitched over (Spine 34°), the hips turned a little toward the catch.
 */
const ANKLE_Y = 0.095;   // the ankle target that lands the hero's ankles at their stance height (0.068–0.075 m) — a stance ankle, reference metres
const STANCE_FEET = { Left: [-0.19, ANKLE_Y, 0.085] as V3, Right: [0.19, ANKLE_Y, 0.085] as V3 };
const SPLIT_FEET = { Left: [-0.19, ANKLE_Y, 0.25] as V3, Right: [0.21, ANKLE_Y, -0.20] as V3 };
const TRAIL_MID: V3 = [0.20, ANKLE_Y + 0.05, -0.06];   // the trail foot in the air, halfway back (or forward)
const LEAD_MID: V3 = [-0.19, ANKLE_Y + 0.05, 0.17];    // the lead foot in the air, halfway out (or back)
const BETWEEN_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.05, bones: { ...torso(3, 21, -2, [-6, 0, 0]) }, hipsY: -0.12, R: 'on', L: OFF_HAND, feet: { Left: STANCE_FEET.Left, Right: TRAIL_MID } },
  { t: 0.10, bones: { ...torso(6, 28, -4, [-8, 0, 0]) }, hipsY: -0.22, R: 'on', L: { near: 0.30, off: [-0.02, 0.18, 0.06] }, feet: { Left: STANCE_FEET.Left, Right: SPLIT_FEET.Right } },
  { t: 0.13, bones: { ...torso(6.5, 30, -4.5, [-8.5, 0, 0]) }, hipsY: -0.26, R: { near: 0.10, off: [0.02, 0.03, -0.03] }, L: { near: 0.30, off: [-0.018, 0.14, 0.05] }, feet: { Left: LEAD_MID, Right: SPLIT_FEET.Right } },
  { t: 0.16, bones: { ...torso(7, 32, -5, [-9, 0, 0]) }, hipsY: -0.30, R: { near: 0.10, off: [0.03, 0.04, -0.05] }, L: { near: 0.30, off: [-0.015, 0.10, 0.04] }, feet: SPLIT_FEET },
  { t: 0.19, bones: { ...torso(8, 34, -6, [-10, 0, 0]) }, hipsY: -0.33, R: { near: 0.10, off: [0.04, 0.06, -0.08] }, L: { near: 0.30, off: [-0.01, 0.06, 0.02] }, feet: SPLIT_FEET },
  { t: 0.30, bones: { ...torso(4, 26, -2, [-8, 0, 0]) }, hipsY: -0.25, R: [0.24, 0.90, 0.10], L: 'on', feet: SPLIT_FEET },
  { t: 0.35, bones: { ...torso(3, 22, -1, [-7, 0, 0]) }, hipsY: -0.20, R: [0.245, 0.93, 0.105], L: 'on', feet: { Left: LEAD_MID, Right: SPLIT_FEET.Right } },
  { t: 0.40, bones: { ...torso(2, 18, -1, [-6, 0, 0]) }, hipsY: -0.14, R: [0.25, 0.95, 0.11], L: 'on', feet: { Left: STANCE_FEET.Left, Right: SPLIT_FEET.Right } },
  { t: 0.44, bones: { ...torso(1, 16, -1, [-5, 0, 0]) }, hipsY: -0.09, R: [0.25, 0.96, 0.11], L: 'on', feet: { Left: STANCE_FEET.Left, Right: TRAIL_MID } },
  { t: 0.48, bones: { ...torso(0, 14) }, hipsY: -0.05, R: OFF_R, L: 'on', feet: STANCE_FEET },
];
/**
 * BEHIND THE BACK (plan §4.4): 0.46 s — the right hand wraps the ball round the hip (0–0.14: out to (0.21, 0.76, −0.12), released at
 * (0.06, 0.74, −0.20)), the floor behind the heels at 0.25, the left hand takes it on its own side 0.34–0.46. The SHOULDER turns away
 * (hips −22°: the right shoulder back) to make the room, the trunk pitched 18–20°, the body 0.12 down; the wrapping arm's elbow points
 * out and back, never across the body — on the carry's pole (V2_BALL_POLE, as every hand on the path): its own wrap pole (0.8, −0.2, −0.5)
 * sat 17° from the carry's solve at the wrap's release (handleV2.test's hand-over read).
 */
const BEHIND_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: 'on', L: OFF_HAND },
  { t: 0.08, bones: { ...torso(-14, 18, 8), ...LEGS.load }, hipsY: -0.10, R: 'on', L: [-0.28, 0.94, 0.10] },
  { t: 0.14, bones: { ...torso(-22, 19, 12), ...LEGS.wide }, hipsY: -0.12, R: 'on', L: { near: 0.34, off: [-0.02, 0.18, -0.06] } },
  { t: 0.25, bones: { ...torso(-14, 19, 8), ...LEGS.wide }, hipsY: -0.12, R: { near: 0.14, off: [0.06, 0.08, 0.04] }, L: { near: 0.34, off: [-0.01, 0.07, -0.03] } },
  { t: 0.34, bones: { ...torso(-5, 24, 3), ...LEGS.low }, hipsY: -0.17, R: [0.22, 0.92, 0.02], L: 'on' },
  { t: 0.46, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: OFF_R, L: 'on' },
];
/**
 * THE BTB SLIDE (H2, owner 2026-10-16: "add a curry slide like behind the back"; a generic name on screen, no real names): the
 * behind-the-back's wrap and path (0.46 s), the body SKIPPING sideways the way the ball goes. DribbleController.slide moves the root
 * (3 m/s, its launch 0.35 s), so the clip keeps the feet light while the root travels: the right foot drives and the lead (left) foot
 * reaches out (0.06–0.14), both feet off the floor through the skip (0.14–0.26), the lead lands wide (0.30), the trail closes under the
 * catch (0.38). The shoulder turns away for the wrap like the behind-the-back's (hips −20°) and the chest stays on the man; the body loads
 * low before the push and lands low on the catch. Keyed as ankles (V2Key.feet), right hand first. assumption: the skip's timing against
 * the root's travel is mine, not measured yet — the reel's foot-slide column is its check.
 */
const SLIDE_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.06, bones: { ...torso(-10, 18, 5) }, hipsY: -0.12, R: 'on', L: [-0.28, 0.94, 0.10], feet: STANCE_FEET },   // the load
  { t: 0.14, bones: { ...torso(-20, 19, 11) }, hipsY: -0.09, R: 'on', L: { near: 0.34, off: [-0.02, 0.18, -0.06] }, feet: { Left: [-0.30, ANKLE_Y + 0.05, 0.08], Right: STANCE_FEET.Right } },   // the drive: the lead foot off, the right pushes
  { t: 0.22, bones: { ...torso(-20, 19, 11) }, hipsY: -0.06, R: { near: 0.14, off: [0.06, 0.08, 0.04] }, L: { near: 0.34, off: [-0.01, 0.10, -0.04] }, feet: { Left: [-0.33, ANKLE_Y + 0.06, 0.07], Right: [0.12, ANKLE_Y + 0.07, 0.07] } },   // the skip: both feet light
  { t: 0.30, bones: { ...torso(-12, 21, 6) }, hipsY: -0.12, R: [0.22, 0.92, 0.04], L: { near: 0.34, off: [-0.01, 0.04, -0.02] }, feet: { Left: [-0.30, ANKLE_Y, 0.07], Right: [0.08, ANKLE_Y + 0.05, 0.07] } },   // the lead lands wide
  { t: 0.38, bones: { ...torso(-5, 22, 3) }, hipsY: -0.15, R: [0.23, 0.93, 0.08], L: 'on', feet: { Left: [-0.24, ANKLE_Y, 0.08], Right: [0.14, ANKLE_Y, 0.08] } },   // the trail closes under the catch
  { t: 0.46, bones: { ...torso(0, 14) }, hipsY: -0.05, R: OFF_R, L: 'on', feet: STANCE_FEET },
];
/**
 * DOUBLE CROSS (plan §4.5): 0.60 s — R → L (the push 0–0.08, the floor at 0.17, the left hand's low catch 0.25–0.29), the left hand pushes
 * it straight back (0.29–0.35), the floor at 0.43, the right hand's catch 0.51–0.60. The hips go one way, come back THROUGH the middle
 * (the half-beat he has to read), and go further the second time — lower, harder. Both feet stay planted where the stance put them
 * (V2Key.feet: the knees fold to them — keyed by bones at hipsY −0.22 the trail ankle went 0.068 m through the floor).
 */
const DOUBLE_CROSS_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.08, bones: { ...torso(12, 18, -6), ...LEGS.pushR }, hipsY: -0.08, R: 'on', L: { near: 0.25, off: [0.02, 0.14, -0.08] }, feet: STANCE_FEET },
  { t: 0.17, bones: { ...torso(20, 25, -10), ...LEGS.low }, hipsY: -0.16, R: { near: 0.08, off: [0.04, 0.08, -0.05] }, L: { near: 0.25, off: [0.0, 0.05, -0.03] }, feet: STANCE_FEET },
  { t: 0.27, bones: { ...torso(6, 26, -3), ...LEGS.low }, hipsY: -0.18, R: { near: 0.51, off: [0.02, 0.18, -0.06] }, L: 'on', feet: STANCE_FEET },
  { t: 0.35, bones: { ...torso(-10, 30, 5), ...LEGS.low }, hipsY: -0.22, R: { near: 0.51, off: [0.01, 0.12, -0.04] }, L: 'on', feet: STANCE_FEET },
  { t: 0.43, bones: { ...torso(-26, 30, 14), ...LEGS.low }, hipsY: -0.22, R: { near: 0.51, off: [0.0, 0.05, -0.02] }, L: { near: 0.35, off: [-0.04, 0.08, -0.05] }, feet: STANCE_FEET },
  { t: 0.51, bones: { ...torso(-14, 28, 7), ...LEGS.low }, hipsY: -0.20, R: 'on', L: [-0.24, 0.94, 0.16], feet: STANCE_FEET },
  { t: 0.60, bones: { ...torso(0, 14), ...LEGS.stance }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
];
/**
 * THE SHAMMGOD (plan §4.6): 0.58 s — the right hand PUSHES it out long in front (to (0.18, 0.55, 0.60) by 0.14, the arm nearly straight: the
 * reach he commits to), the floor at 0.24 out ahead, the LEFT hand arrives on it at 0.34 and pulls it across to its own side by 0.58. The
 * body lunges into the push (the left foot steps out 0.32 m, lifted, and plants; the hips down), then turns away with the pull and the foot
 * comes back. Keyed as ankles (V2Key.feet): keyed by bones, the lunge's trail ankle went 0.146 m through the floor at bind (0.13 m on the
 * probe's frames).
 */
const SHAM_STEP: V3 = [-0.20, ANKLE_Y + 0.06, 0.24];   // the lead (left) foot in the air, halfway out (or back)
const SHAM_LUNGE = { Left: [-0.21, ANKLE_Y, 0.40] as V3, Right: STANCE_FEET.Right };
const SHAMMGOD_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.07, bones: { ...torso(3, 27, -2) }, hipsY: -0.12, R: 'on', L: OFF_HAND, feet: { Left: SHAM_STEP, Right: STANCE_FEET.Right } },
  { t: 0.14, bones: { ...torso(6, 40, -4) }, hipsY: -0.20, R: 'on', L: [-0.16, 0.86, 0.34], feet: SHAM_LUNGE },   // the arm long and LOW: the body goes out and down with it
  { t: 0.24, bones: { ...torso(-4, 40, 2) }, hipsY: -0.21, R: { near: 0.14, off: [0.02, 0.06, -0.08] }, L: { near: 0.34, off: [-0.02, 0.07, -0.02] }, feet: SHAM_LUNGE },
  { t: 0.34, bones: { ...torso(-14, 38, 8) }, hipsY: -0.20, R: [0.24, 0.84, 0.30], L: 'on', feet: SHAM_LUNGE },
  { t: 0.46, bones: { ...torso(-20, 22, 12) }, hipsY: -0.10, R: [0.26, 0.94, 0.20], L: 'on', feet: { Left: SHAM_STEP, Right: STANCE_FEET.Right } },
  { t: 0.58, bones: { ...torso(-6, 15, 3) }, hipsY: -0.06, R: OFF_R, L: 'on', feet: STANCE_FEET },
];
/**
 * IN AND OUT (plan §4.7): 0.34 s, ONE hand — pushed in toward the midline (to (0.12, 0.60, 0.26) by 0.08, as if crossing), the floor at
 * 0.16, the SAME hand takes it back out 0.24–0.34. The body sells: the hips turn 14° toward the fake, the lead (left) foot jabs toward it,
 * and the off hand holds out at (−0.28, 1.0, 0.12) — it never goes for the ball (the capture was a two-hand rip, MAP gap 8). The lie is
 * the accent (hold on the fake's peak). The jab is keyed as ankles (V2Key.feet: lifted out, planted, lifted back — keyed by bones its
 * trail ankle went 0.053 m through the floor at bind).
 */
const JAB_OUT = { Left: [-0.30, ANKLE_Y, 0.22] as V3, Right: STANCE_FEET.Right };   // the lead foot planted out toward the fake
const IN_AND_OUT_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.08, bones: { ...torso(10, 18, -5) }, hipsY: -0.08, R: 'on', L: [-0.28, 1.0, 0.12], feet: { Left: [-0.27, ANKLE_Y + 0.05, 0.17], Right: STANCE_FEET.Right } },
  { t: 0.16, bones: { ...torso(14, 22, -7) }, hipsY: -0.12, R: { near: 0.08, off: [0.02, 0.04, -0.02] }, L: [-0.28, 1.0, 0.12], hold: true, feet: JAB_OUT },
  { t: 0.24, bones: { ...torso(6, 26, -3) }, hipsY: -0.17, R: 'on', L: [-0.27, 1.0, 0.12], feet: { Left: [-0.24, ANKLE_Y + 0.04, 0.15], Right: STANCE_FEET.Right } },
  { t: 0.34, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
];
/**
 * THE HESITATION (H2b, plan §4.8): 0.66 s on the hesi path. The load (0–0.06: the ball pushed into a soft high bounce, the knees
 * down), THE RISE (0.15–0.32: the hips come up 0.09 to the hitch, the spine goes from 20° over to 4°, the head up — the defender reads "he is
 * stopping" and stands up; the ball floats at the top of its bounce, P + 0.06, held at 0.32: the hitch), then LOW AND GONE
 * (0.32–0.66: the hips drop 0.13 under the stance, the chest over 26°, the lead foot steps out 0.22 m on the pound forward). Keyed
 * as ankles (V2Key.feet); the pivot (right) foot stays put. The controller's hang (DribbleController.HESI_HANG_SEC) holds the body
 * still through the rise, so the explode leaves from a stop.
 */
const HESI_STEP = { Left: [-0.19, ANKLE_Y, 0.30] as V3, Right: STANCE_FEET.Right };
const HESI_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.06, bones: { ...torso(0, 20, 0, [-2, 0, 0]) }, hipsY: -0.11, R: 'on', L: OFF_HAND, feet: STANCE_FEET },   // the load
  { t: 0.15, bones: { ...torso(0, 13, 0, [-6, 0, 0]) }, hipsY: -0.06, R: { near: 0.24, off: [0.0, 0.08, -0.02] }, L: [-0.26, 1.02, 0.12], feet: STANCE_FEET },
  { t: 0.24, bones: { ...torso(0, 12, 0, [-8, 0, 0]) }, hipsY: -0.08, R: 'on', L: [-0.26, 1.03, 0.12], feet: STANCE_FEET },   // the rise (the hand meets the ball low on its way up: at −0.02 it could not reach)
  { t: 0.32, bones: { ...torso(0, 4, 0, [-10, 0, 0]) }, hipsY: -0.02, R: 'on', L: [-0.26, 1.04, 0.12], hold: true, feet: STANCE_FEET },   // the hitch: tall, still, the ball up
  { t: 0.42, bones: { ...torso(-4, 24, 2, [-4, 0, 0]) }, hipsY: -0.14, R: 'on', L: [-0.24, 0.94, 0.16], feet: { Left: [-0.19, ANKLE_Y + 0.06, 0.20], Right: STANCE_FEET.Right } },   // GONE: low, the lead foot out
  { t: 0.49, bones: { ...torso(-5, 26, 3, [-4, 0, 0]) }, hipsY: -0.16, R: { near: 0.56, off: [0.02, 0.10, -0.04] }, L: [-0.24, 0.92, 0.18], feet: HESI_STEP },
  { t: 0.56, bones: { ...torso(-3, 30, 2, [-4, 0, 0]) }, hipsY: -0.20, R: 'on', L: [-0.24, 0.92, 0.16], feet: HESI_STEP },   // the low catch off the pound
  { t: 0.66, bones: { ...torso(0, 18, 0) }, hipsY: -0.09, R: 'on', L: OFF_HAND, feet: { Left: [-0.19, ANKLE_Y, 0.20], Right: STANCE_FEET.Right } },
];
/**
 * THE YOYO (H2b, plan §4.9): 0.67 s on the yoyo path — the ball pounded low (0–0.30: its top at 0.55 of the stroke) then floated high
 * (0.48–0.59, the top at P + 0.08, held: the dare). Square and tall: no hip yaw; the knees go down to meet the low ball and come up
 * with the high one; the feet never move.
 */
const YOYO_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.06, bones: { ...torso(0, 18) }, hipsY: -0.09, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.15, bones: { ...torso(0, 30) }, hipsY: -0.21, R: { near: 0.21, off: [0.0, 0.07, -0.02] }, L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.21, bones: { ...torso(0, 36, 0, [-2, 0, 0]) }, hipsY: -0.27, R: 'on', L: OFF_HAND, feet: STANCE_FEET },   // down to the low pound (the hand only reaches it this low)
  { t: 0.30, bones: { ...torso(0, 33, 0, [-3, 0, 0]) }, hipsY: -0.24, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.38, bones: { ...torso(0, 24, 0, [-5, 0, 0]) }, hipsY: -0.15, R: { near: 0.48, off: [0.0, 0.08, -0.02] }, L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.48, bones: { ...torso(0, 12, 0, [-7, 0, 0]) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.59, bones: { ...torso(0, 8, 0, [-9, 0, 0]) }, hipsY: -0.03, R: 'on', L: OFF_HAND, hold: true, feet: STANCE_FEET },   // high: the dare
  { t: 0.67, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
];
/**
 * PAUSIN' (H2b, plan §4.18): 1.02 s on the pausin path — 0.12 s to take the ball out to the side (S + 0.08, P − 0.05, F + 0.12: the
 * palm on top), then held. The body sits low (−0.14) with the weight back (the spine up to 8°), the off arm out for balance.
 */
const PAUSIN_V2: readonly V2Key[] = [
  { t: 0, bones: { ...torso(0, 14) }, hipsY: -0.05, R: 'on', L: OFF_HAND, feet: STANCE_FEET },
  { t: 0.12, bones: { ...torso(-6, 8, 3, [-6, 0, 0]) }, hipsY: -0.14, R: 'on', L: [-0.34, 1.02, 0.18], feet: STANCE_FEET },
  { t: 0.57, bones: { ...torso(-6, 9, 3, [-7, 0, 0]) }, hipsY: -0.15, R: 'on', L: [-0.35, 1.01, 0.18], feet: STANCE_FEET },
  { t: 1.02, bones: { ...torso(-6, 8, 3, [-6, 0, 0]) }, hipsY: -0.14, R: 'on', L: [-0.34, 1.02, 0.18], feet: STANCE_FEET },
];
/** The BTB slide's keys (H2): on the behind-the-back's path, so not in V2_KEYS (one table per path); the tests read it here. */
export const SLIDE_V2_KEYS: readonly V2Key[] = SLIDE_V2;
/** The v2 key tables by path (the tests resolve them the way the builders do). */
export const V2_KEYS: Readonly<Partial<Record<PathMove, readonly V2Key[]>>> = {
  crossover: CROSSOVER_V2, momentum_cross: MOMENTUM_CROSS_V2, between_legs: BETWEEN_V2, behind_back: BEHIND_V2, double_cross: DOUBLE_CROSS_V2,
  shammgod: SHAMMGOD_V2, in_and_out: IN_AND_OUT_V2, hesi: HESI_V2, yoyo: YOYO_V2, pausin: PAUSIN_V2,
};
