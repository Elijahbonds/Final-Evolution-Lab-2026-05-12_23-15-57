// DEMO-LOOPS-8 (2026-11-03): first the Playbook lessons that had no loop of their own (lib/education/lessonDemo.ts "NOT
// LISTED"): the foot tripod and short foot with the one-foot pogo (ch. 2), the seated ankle circles then the knee-to-wall
// (ch. 4), the hip 90/90 turn, the quadruped thoracic rotation, the hands-on-thighs bodyweight hinge (ch. 8) and the
// supine one-knee twist (ch. 9) — each read against the book's own steps (lib/education/playbook.data.json). Then the
// measured library gaps. Same kit and pipeline as the library's loops: GATE 0 on every body is poseGuard.test.ts, the
// floor and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, ELBOWS_BACK, ELBOWS_OUT, HANG, HANG_POLES, SEATED, SEAT_Y, STAND, STANCE, UPPER, both, bothDir, lie, loop, rep, repOf, seat,
  type Deg3, type ExKey, type Pair, type RepPair, type V3,
} from './exerciseKit';
import { alternating, kneel, oneArm } from './exerciseMore';
import { run, at, other, sx } from './exerciseBody';
import { LIE_BACK, POSITIONS, QUAD_HANDS, QUAD_POSE } from './exerciseFloor';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);

// ── the Playbook's lessons ──────────────────────────────────────────────────────────────────────────────────────────

/** ex_ankle_reset (ch. 2, the Ankle Architecture Reset, one foot) — standing, the hands on the hips: the weight onto the left
 *  foot and the right foot just off the floor; the tripod set and the arch drawn up (the short foot), held for three, twice;
 *  then small quick pogos on that foot, the ankle doing the work, the ball of the foot barely leaving the floor; and down. */
const ankleReset: Builder = (scene, sk) => {
  const free: Record<string, Deg3> = { RightUpLeg: [-14, 0, 0], RightLeg: [56, 0, 0], RightFoot: [22, 0, 0] };
  const twoFeet: Pose = { bones: { ...STAND }, feet: STANCE, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.01 };
  const oneFoot = (arch: number): Pose => ({
    bones: { ...STAND, ...free, LeftFoot: [0, 0, -5 * arch], LeftToeBase: [-8 * arch, 0, 0] },
    feet: { Left: [-0.11, ANKLE, 0.07] }, kneePoles: { Left: [-0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.01, hipsX: -0.06,
  });
  const contact: Pose = { ...oneFoot(1), bones: { ...STAND, ...free, Hips: [4, 0, 0], LeftFoot: [-6, 0, -5], LeftToeBase: [-8, 0, 0] }, hipsY: -0.04 };
  const air: Pose = { bones: { ...STAND, ...free, LeftUpLeg: [-3, 0, 0], LeftLeg: [6, 0, 0], LeftFoot: [22, 0, 0] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0.03, hipsX: -0.06 };
  const keys: ExKey[] = [at(twoFeet, 0, true), at(oneFoot(0), 0.8, true), at(oneFoot(1), 1.4, true), at(oneFoot(1), 3.0, true), at(oneFoot(0), 3.6, true),
    at(oneFoot(1), 4.2, true), at(oneFoot(1), 5.6, true), at(oneFoot(0), 6.2, true)];
  for (let i = 0; i < 6; i++) { keys.push(at(contact, 6.6 + i * 0.36, true)); keys.push(at(air, 6.6 + i * 0.36 + 0.18)); }
  keys.push(at(oneFoot(0), 9.0, true), at(twoFeet, 9.8, true));
  return loop(scene, sk, 'ex_ankle_reset', 10.4, keys);
};

/** The wall the ankle lesson walks up to: its face 1.20 m in front, clear of the chair (demo.ts PROP_SHAPES 'seatwall'). */
const SEATWALL_FACE = 1.20;

/** ex_ankle_unlock (ch. 4 Joint 1, the ankle) — sitting on the edge of a chair, the hands on the hips: one foot lifts and
 *  draws slow circles one way, then the other; then the other foot. Then up and two steps to the wall: a split stance, the
 *  hands on it, and the front knee drives toward the wall over the toes, the heel staying down, three times; and back to
 *  the chair. */
const ankleUnlock: Builder = (scene, sk) => {
  const sitFeet = both(0.17, ANKLE, 0.48);
  const sit = (lift?: 'Left' | 'Right', a = 0): Pose => {
    const bones: Record<string, Deg3> = { ...SEATED.bones };
    const feet: Pair = { ...sitFeet };
    if (lift) {
      const k = lift === 'Left' ? 1 : -1;
      bones[`${lift}UpLeg`] = [-98, 0, 8 * k]; bones[`${lift}Leg`] = [62, 0, 0]; bones[`${lift}Foot`] = [16 * Math.cos(a), 0, 16 * Math.sin(a) * k];
      delete feet[lift];
    }
    return { ...SEATED, bones, feet, kneePoles: bothDir(0.1, 0.3, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: SEAT_Y };
  };
  const lean: Pose = { bones: { Hips: [38, 0, 0], Spine: [6, 0, 0], Neck: [-16, 0, 0] }, feet: sitFeet, kneePoles: bothDir(0.1, 0.2, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.30, hipsZ: 0.14 };
  const stand: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, 0.48), kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.01, hipsZ: 0.42 };
  const front = SEATWALL_FACE - 0.24, back = 0.40;
  const mid: Pose = { bones: { ...STAND, Hips: [4, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.48], Right: [0.12, ANKLE + 0.09, 0.74] }, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.02, hipsZ: 0.55 };
  const wallHands: Pair = both(0.22, 1.20, SEATWALL_FACE - 0.03);
  const k2w = (fwd: number, hands = true): Pose => ({
    bones: { Hips: [6 + fwd * 20, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], RightFoot: [-fwd * 34, 0, 0], LeftFoot: [22, 0, 0] },
    feet: { Right: [0.12, ANKLE, front], Left: [-0.12, ANKLE + 0.09, back] }, kneePoles: { Right: [0.05, 0, 1], Left: [-0.05, 0, 1] },
    ...(hands ? { handsAt: wallHands, poles: bothDir(0.6, -0.3, -0.6) } : { rel: ON_HIPS, poles: HIPS_POLES }), hipsY: -0.06 - fwd * 0.10, hipsZ: 0.62 + fwd * 0.16,
  });
  const keys: ExKey[] = [at(sit(), 0, true), at(sit('Left', 0), 0.6, true)];
  const circles = (side: 'Left' | 'Right', t0: number) => {
    for (let i = 1; i <= 8; i++) keys.push(at(sit(side, (i / 8) * 2 * Math.PI), t0 + i * 0.25, i === 8));
    for (let i = 1; i <= 8; i++) keys.push(at(sit(side, (-i / 8) * 2 * Math.PI), t0 + 2.0 + i * 0.25, i === 8));
  };
  circles('Left', 0.6);
  keys.push(at(sit(), 5.0, true), at(sit('Right', 0), 5.5, true));
  circles('Right', 5.5);
  keys.push(at(sit(), 9.9, true), at(lean, 10.5), at(stand, 11.2, true), at(mid, 11.7), at(k2w(0, false), 12.2, true), at(k2w(0), 12.7, true));
  let t = 12.7;
  for (let r = 0; r < 3; r++) { keys.push(at(k2w(1), t + 0.8, true), at(k2w(1), t + 1.2, true), at(k2w(0), t + 1.9, true)); t += 1.9; }
  keys.push(at(k2w(0, false), t + 0.5, true), at(mid, t + 1.0), at(stand, t + 1.5, true), at(lean, t + 2.2), at(sit(), t + 2.9, true));
  return loop(scene, sk, 'ex_ankle_unlock', t + 3.3, keys);
};

/** ex_quad_t_rot (ch. 4 Joint 3, the quadruped thoracic rotation) — on the hands and knees, the right hand under the shoulder
 *  and the left hand behind the head: the left elbow turns down toward the right hand, then up toward the ceiling, the eyes
 *  following it, the hips still over the knees. */
const quadTRot: Builder = (scene, sk) => {
  const p = (turn: number): Pose => {
    const y = turn * 19;
    return {
      ...QUAD_POSE,
      bones: { ...QUAD_POSE.bones, Spine: [0, y, 0], Spine1: [0, y, 0], Neck: [-40, turn * 16, 0] },
      hands: { Right: QUAD_HANDS.Right }, rel: { Left: [0.15 - 0.04 * Math.max(0, turn), 0.10 - 0.07 * turn, 0.16] },
      poles: { Right: QUAD_POSE.poles!.Right, Left: turn >= 0 ? [-0.4, 1, 0] : [0.4, -1, 0.3] },
    };
  };
  return run(scene, sk, 'ex_quad_t_rot', 5.6, [at(p(0), 0, true), at(p(-0.6), 1.2, true), at(p(-0.6), 1.6, true), at(p(1), 3.4, true), at(p(1), 4.2, true)], true);
};

/** ex_ninety_turn (ch. 4, the hip 90/90 position) — sitting tall in the 90/90, both sit bones down, the hands on the floor
 *  beside the hips: the chest turns toward the front leg, about fifteen degrees, and holds through a breath; and back. */
const ninetyTurn: Builder = (scene, sk) => {
  const base = POSITIONS.ninety[0];
  const s = (base.feet?.Right?.[2] ?? 0) > 0 ? -1 : 1;   // toward the front knee: the right one turns the chest right (yaw −)
  const tall: Pose = { ...base, bones: { ...base.bones, Hips: [-2, 0, 0], Spine: [-2, 0, 0] } };
  const turned: Pose = { ...tall, bones: { ...tall.bones, Spine: [-2, 8 * s, 0], Spine1: [0, 7 * s, 0], Neck: [0, 6 * s, 0] } };
  return run(scene, sk, 'ex_ninety_turn', 7.0, [at(tall, 0, true), at(tall, 0.8, true), at(turned, 2.2, true), at(turned, 5.0, true), at(tall, 6.4, true)], true);
};

/** ex_bw_hinge (ch. 8, the hip hinge: the bodyweight Romanian deadlift) — standing tall, feet hip-width, soft knees, the hands
 *  on the fronts of the thighs: the hips push straight back as the hands slide down toward the knees, the back flat, to about
 *  45°; then the hips drive forward to stand, the glutes squeezed at the top. */
const bwHinge: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.10);
  const top: Pose = { bones: { ...STAND, LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.06, -0.48, 0.14], Right: [-0.06, -0.48, 0.14] }, poles: bothDir(0.3, 0, -1), hipsY: -0.02 };
  const squeeze: Pose = { ...top, bones: { ...top.bones, Hips: [-3, 0, 0], Spine: [3, 0, 0] }, hipsY: -0.01 };
  const low: Pose = { bones: { Hips: [46, 0, 0], Spine: [3, 0, 0], Spine1: [0, 0, 0], Neck: [-22, 0, 0], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0], LeftFoot: [-4, 0, 0], RightFoot: [-4, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.06, -0.58, 0.10], Right: [-0.06, -0.58, 0.10] }, poles: bothDir(0.3, 0, -1), hipsY: -0.07, hipsZ: -0.06 };
  return run(scene, sk, 'ex_bw_hinge', 5.0, [at(top, 0, true), at(top, 0.6, true), at(low, 2.4, true), at(low, 2.8, true), at(squeeze, 3.9, true), at(squeeze, 4.5, true)]);
};

/** ex_knee_across (ch. 9, the supine spinal twist; free-exercise-db's Knee Across The Body) — on the back, one leg long, the
 *  arms out on the floor: the left knee draws up toward the chest, then across the body toward the floor on the right, the
 *  shoulders flat and the head turned the other way; held through slow breaths, back to the chest, long; then the right. */
const kneeAcross: Builder = (scene, sk) => {
  const arms: Pose = { hands: both(0.62, 0.05, -0.40), poles: bothDir(0, 1, 0) };
  const long: Pose = { ...LIE_BACK, ...arms, bones: { ...LIE_BACK.bones, LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] } };
  const side = (s: 'Left' | 'Right', phase: 'chest' | 'across'): Pose => {
    const k = s === 'Left' ? 1 : -1;
    const leg: Record<string, Deg3> = phase === 'chest' ? { [`${s}UpLeg`]: [-100, 0, 0], [`${s}Leg`]: [110, 0, 0], [`${s}Foot`]: [20, 0, 0] } : { [`${s}UpLeg`]: [-80, 0, 52 * k], [`${s}Leg`]: [96, 0, 0], [`${s}Foot`]: [20, 0, 0] };
    return { ...long, bones: { ...long.bones, ...leg, ...(phase === 'across' ? { Spine: [0, -8 * k, 0], Neck: [10, 34 * k, 0] } : {}) } };
  };
  return run(scene, sk, 'ex_knee_across', 14.0, [
    at(long, 0, true), at(side('Left', 'chest'), 1.2, true), at(side('Left', 'across'), 2.6, true), at(side('Left', 'across'), 5.4, true), at(side('Left', 'chest'), 6.4, true), at(long, 7.0, true),
    at(side('Right', 'chest'), 8.2, true), at(side('Right', 'across'), 9.6, true), at(side('Right', 'across'), 12.4, true), at(side('Right', 'chest'), 13.4, true),
  ], true);
};

// ── the measured gaps: curls ────────────────────────────────────────────────────────────────────────────────────────

/** Standing tall, elbows pinned at the sides (UPPER.curl), with the hands' turn: `palm` +1 palms up, −1 palms down, 0 in. */
const handTurn = (palm: number): Record<string, Deg3> => ({ LeftHand: [0, 75 * palm, 0], RightHand: [0, -75 * palm, 0] });
/** ex_zottman — palms facing in at the bottom; the dumbbells curl up as the wrists turn palms up, then turn palms down at
 *  the top and lower that way, turning back palms in at the bottom. */
const zottman: Builder = (scene, sk) => {
  const C = UPPER.curl;
  const p = (top: boolean, palm: number): Pose => ({ ...(top ? C.b : C.a), bones: { ...STAND, ...handTurn(palm) } });
  return loop(scene, sk, 'ex_zottman', 4.0, [at(p(false, 0), 0, true), at(p(true, 1), 0.9, true), at(p(true, 1), 1.2, true), at(p(true, -1), 1.6, true), at(p(false, -1), 2.9, true), at(p(false, 0), 3.4, true)]);
};
/** ex_cross_hammer — palms in, the right dumbbell curls up across the body toward the left shoulder and lowers the same
 *  way; then the left. */
const crossHammer: Builder = (scene, sk) => alternating(scene, sk, 'ex_cross_hammer', {
  a: UPPER.curl.a, b: { ...UPPER.curl.b, hands: both(-0.04, 1.32, 0.24), poles: bothDir(0.7, -0.6, -0.3) }, t: [0.9, 0.3, 1.0, 0.3],
});
/** ex_drag_curl — the bar curls up dragged against the front of the body, the elbows travelling back behind it, the
 *  shoulders down. */
const dragCurl: Builder = (scene, sk) => rep(scene, sk, 'ex_drag_curl',
  { bones: STAND, feet: STANCE, hands: both(0.20, 0.86, 0.14), poles: ELBOWS_BACK, hipsY: 0 },
  { bones: STAND, feet: STANCE, hands: both(0.20, 1.24, 0.16), poles: bothDir(0.25, -0.1, -1), hipsY: 0 }, 0.9, 0.3, 1.0, 0.3);
/** ex_concentration_stand — bent forward at the hips, the left hand on the left thigh, the right arm hanging straight
 *  down, the elbow pointing out: the dumbbell curls up toward the chest, the upper arm still. */
const concentrationStand: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [56, 0, 0], Spine: [8, 0, 0], Neck: [-24, 0, 0] }, feet: both(0.20, ANKLE, 0.10), kneePoles: bothDir(0.2, 0, 1), hipsY: -0.10 };
  return rep(scene, sk, 'ex_concentration_stand',
    { ...base, rel: { Left: [0.06, -0.50, 0.12], Right: [-0.02, -0.56, 0.04] }, poles: { Left: [-0.3, 0, -1], Right: [1, 0, 0.2] } },
    { ...base, rel: { Left: [0.06, -0.50, 0.12], Right: [-0.16, -0.30, 0.02] }, poles: { Left: [-0.3, 0, -1], Right: [1, 0, 0.2] } }, 0.9, 0.4, 1.0, 0.3);
};
/** ex_lying_cable_curl — lying on the back on the floor, legs long, the bar at the thighs, arms long and the elbows at the
 *  sides: the bar curls up toward the chest, the upper arms staying on the floor. */
const lyingCableCurl: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [12, 0, 0], LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hipsY: -0.84 };
  return rep(scene, sk, 'ex_lying_cable_curl',
    { ...base, hands: both(0.18, 0.18, 0.18), poles: bothDir(0.3, -1, 0) },
    { ...base, hands: both(0.17, 0.36, -0.18), poles: bothDir(0.3, -1, 0.2) }, 0.9, 0.3, 1.0, 0.3);
};
/** ex_lying_db_curl — lying face up on a flat bench, the arms hanging straight down beside it, palms in: the dumbbells
 *  curl up as the palms turn up, the upper arms still. */
const lyingDbCurl: Builder = (scene, sk) => rep(scene, sk, 'ex_lying_db_curl',
  lie({ bones: handTurn(0), hands: both(0.34, 0.14, -0.40), poles: bothDir(0.3, -0.2, 1) }),
  lie({ bones: handTurn(1), hands: both(0.32, 0.46, -0.34), poles: bothDir(0.3, -1, 0.3) }), 1.0, 0.3, 1.1, 0.3);

// ── flyes ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_pec_deck (the butterfly) — seated, the back on the pad, the upper arms out level with the shoulders, the forearms
 *  up: the arms close together in front, squeezed, and open back out. */
const pecDeck: Builder = (scene, sk) => rep(scene, sk, 'ex_pec_deck',
  seat({ hands: both(0.52, 1.66 + SEAT_Y, 0.02), poles: bothDir(0.9, -0.4, -0.3) }),
  seat({ hands: both(0.10, 1.62 + SEAT_Y, 0.34), poles: bothDir(0.8, -0.6, 0) }), 0.9, 0.4, 1.1, 0.3);
const LEAN: Pose = { bones: { Hips: [10, 0, 0], Spine: [4, 0, 0], Neck: [-6, 0, 0] }, feet: { Left: [-0.12, ANKLE, 0.24], Right: [0.12, ANKLE, -0.10] }, kneePoles: bothDir(0.1, 0, 1), hipsY: -0.02 };
/** ex_crossover — the high cables: a step in front, a small forward lean, the hands together low in front; the arms open
 *  out wide and up in a big arc, elbows soft, and sweep back down together. */
const crossover: Builder = (scene, sk) => rep(scene, sk, 'ex_crossover',
  { ...LEAN, hands: both(0.08, 1.08, 0.46), poles: bothDir(0.8, 0.2, -0.4) },
  { ...LEAN, hands: both(0.80, 1.62, 0.02), poles: bothDir(0.3, -0.4, -0.9) }, 1.1, 0.3, 1.0, 0.3);
/** ex_crossover_low — the low cables: the hands low and wide below the waist, palms forward; they sweep up and in to meet
 *  in front of the chest, and back down. */
const crossoverLow: Builder = (scene, sk) => rep(scene, sk, 'ex_crossover_low',
  { ...LEAN, hands: both(0.46, 0.80, 0.12), poles: bothDir(0.6, -0.2, -0.8) },
  { ...LEAN, hands: both(0.07, 1.30, 0.44), poles: bothDir(0.8, -0.5, -0.2) }, 1.0, 0.3, 1.0, 0.3);
/** ex_crossover_one — the hands together in front, the left one holds while the right arm opens out to the side at
 *  shoulder height, elbow soft, and comes back. */
const crossoverOne: Builder = (scene, sk) => {
  const a: Pose = { ...LEAN, hands: both(0.08, 1.30, 0.46), poles: bothDir(0.8, 0.2, -0.4) };
  return rep(scene, sk, 'ex_crossover_one', a, { ...a, hands: { Left: a.hands!.Left, Right: [0.80, 1.40, 0.04] }, poles: { Left: a.poles!.Left, Right: [0.3, -0.4, -0.9] } }, 1.0, 0.3, 1.0, 0.3);
};
/** ex_iron_cross — standing between the high cables, the arms out in a T: they pull straight down to the sides, held, and
 *  back up to the T. */
const ironCross: Builder = (scene, sk) => rep(scene, sk, 'ex_iron_cross',
  { bones: STAND, feet: STANCE, hands: both(0.80, 1.42, 0.04), poles: bothDir(0.2, 0.6, -0.8), hipsY: 0 },
  { bones: STAND, feet: STANCE, hands: both(0.24, 0.88, 0.08), poles: ELBOWS_OUT, hipsY: 0 }, 1.0, 0.4, 1.0, 0.3);
/** ex_band_crossover — the band behind, the arms out in a T, palms forward, elbows soft: they sweep across the chest to
 *  meet in front, and open back out. */
const bandCrossover: Builder = (scene, sk) => rep(scene, sk, 'ex_band_crossover',
  { bones: STAND, feet: STANCE, hands: both(0.80, 1.42, 0.04), poles: bothDir(0.2, -0.4, -0.9), hipsY: 0 },
  { bones: STAND, feet: STANCE, hands: both(0.06, 1.38, 0.52), poles: bothDir(0.9, -0.3, -0.2), hipsY: 0 }, 1.0, 0.4, 1.0, 0.3);
/** ex_svend_press — the plates squeezed between the palms at the chest, fingers forward: pressed straight out in front,
 *  still squeezing, and back to the chest. */
const svendPress: Builder = (scene, sk) => rep(scene, sk, 'ex_svend_press',
  { bones: STAND, feet: STANCE, hands: both(0.05, 1.30, 0.22), poles: bothDir(1, -0.3, -0.2), hipsY: 0 },
  { bones: STAND, feet: STANCE, hands: both(0.05, 1.32, 0.64), poles: bothDir(1, -0.3, 0), hipsY: 0 }, 0.9, 0.4, 0.9, 0.3);
/** ex_raise_pullover — lying on a flat bench, the bar on the thighs, arms long: it arcs up over the chest and on until the
 *  arms are level behind the head, then back the same way. */
const raisePullover: Builder = (scene, sk) => {
  const zs = -0.44, ys = 0.50, R = 0.58;
  const p = (deg: number): Pose => { const a = (deg * Math.PI) / 180; return lie({ hands: both(0.16, ys + R * Math.sin(a), zs + R * Math.cos(a)), poles: bothDir(0.6, deg < 90 ? -0.6 : 0.6, 0) }); };
  return run(scene, sk, 'ex_raise_pullover', 5.2, [at(p(8), 0, true), at(p(55), 0.6), at(p(100), 1.2), at(p(140), 1.7), at(p(172), 2.2, true), at(p(172), 2.5, true), at(p(140), 3.0), at(p(100), 3.5), at(p(55), 4.1), at(p(8), 4.7, true)]);
};

// ── triceps ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_tate_press — lying on a flat bench, the dumbbells up over the chest, elbows out: the dumbbells tip in and down to
 *  touch the chest, the elbows flaring out, then press back up. */
const tatePress: Builder = (scene, sk) => rep(scene, sk, 'ex_tate_press',
  lie({ hands: both(0.24, 1.08, -0.40), poles: bothDir(1, 0.1, 0) }),
  lie({ hands: both(0.09, 0.70, -0.36), poles: bothDir(1, 0.3, 0) }), 1.0, 0.3, 0.9, 0.3);
/** ex_jm_press — lying on a flat bench, a close grip, the bar over the upper chest: it lowers toward the chin, the elbows
 *  bending forward toward the feet (half a skull crusher, half a close-grip press), and presses back. */
const jmPress: Builder = (scene, sk) => rep(scene, sk, 'ex_jm_press',
  lie({ hands: both(0.12, 1.10, -0.48), poles: bothDir(0.2, 0.2, 1) }),
  lie({ hands: both(0.12, 0.76, -0.58), poles: bothDir(0.2, 0.4, 1) }), 1.0, 0.3, 0.9, 0.3);
/** ex_machine_triceps — seated, the upper arms down the pad in front: from the elbows bent, hands near the shoulders, the
 *  arms push straight down the pad, held, and back. */
const machineTriceps: Builder = (scene, sk) => {
  const base: Pose = { ...SEATED, bones: { ...SEATED.bones, Hips: [8, 0, 0] }, hipsY: SEAT_Y };
  return rep(scene, sk, 'ex_machine_triceps', { ...base, hands: both(0.17, 1.00, 0.30), poles: bothDir(0.2, -0.4, 1) }, { ...base, hands: both(0.18, 0.54, 0.58), poles: bothDir(0.3, 1, 0.4) }, 0.8, 0.3, 1.0, 0.3);
};

// ── sprint drills ─────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_kneel_arm_drill — half-kneeling, the left foot in front, the right knee down, tall: the arms swing as in a sprint,
 *  elbows at about a right angle, the hands from the chin to past the hip, faster as it goes. */
const kneelArmDrill: Builder = (scene, sk) => {
  const p = (s: 'Left' | 'Right'): Pose => {
    const o = other(s);
    return kneel({ bones: { ...STAND, Hips: [-2, 0, 0], Spine: [4, 0, 0] }, rel: { [s]: [sx(s, 0.04), 0.06, 0.30], [o]: [sx(o, -0.02), -0.40, -0.24] } as Pair, poles: { [s]: [sx(s, 0.2), -1, 0.2], [o]: [sx(o, 0.2), -0.4, -1] } as Pair, hipsY: 0 }, ['Right']);
  };
  return run(scene, sk, 'ex_kneel_arm_drill', 2.4, [at(p('Left'), 0), at(p('Right'), 0.6), at(p('Left'), 1.2), at(p('Right'), 1.6), at(p('Left'), 2.0)]);
};
/** ex_sled_push — leaning into the sled's handles at about 45°, the arms long: short, hard alternating drives of the knees,
 *  each foot striking down and back under the hips (in place). */
const sledPush: Builder = (scene, sk) => {
  const hands: Pair = both(0.24, 1.02, 0.56);
  const base: Pose = { bones: { Hips: [40, 0, 0], Spine: [2, 0, 0], Neck: [-18, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: both(0.12, ANKLE + 0.09, -0.40), kneePoles: bothDir(0, 0, 1), hands, poles: bothDir(0.5, -0.6, -0.4), hipsY: -0.14, hipsZ: 0.06 };
  const drive = (s: 'Left' | 'Right'): Pose => { const o = other(s); return { ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-72, 0, 0], [`${s}Leg`]: [92, 0, 0], [`${s}Foot`]: [0, 0, 0] } as Record<string, Deg3>, feet: { [o]: base.feet![o] } as Pair, kneePoles: { [o]: [sx(o, 0), 0, 1] } as Pair }; };
  const toeOff = (s: 'Left' | 'Right'): Pose => { const o = other(s); return { ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-18, 0, 0], [`${s}Leg`]: [76, 0, 0], [`${s}Foot`]: [30, 0, 0] } as Record<string, Deg3>, feet: { [o]: base.feet![o] } as Pair, kneePoles: { [o]: [sx(o, 0), 0, 1] } as Pair }; };
  return run(scene, sk, 'ex_sled_push', 1.6, [at(base, 0), at(toeOff('Left'), 0.12), at(drive('Left'), 0.3), at(base, 0.8), at(toeOff('Right'), 0.92), at(drive('Right'), 1.1)]);
};
/** ex_sled_drag_back — facing the sled, leaning back, the rope or handles in the hands, arms long and low in front: short
 *  quick steps backward, each foot reaching back and pushing through (in place). `overhead`: the hands held up straight
 *  over the head (the overhead backward walk), tall. */
const sledDragBack = (name: string, overhead: boolean): Builder => (scene, sk) => {
  const arms: Pose = overhead ? { rel: { Left: [0.04, 0.60, 0.04], Right: [-0.04, 0.60, 0.04] }, poles: bothDir(1, 0.1, -0.1) } : { hands: both(0.16, 0.92, 0.52), poles: bothDir(0.3, -0.6, -0.6) };
  const lean = overhead ? -4 : -12;
  const stand = (fwd: 'Left' | 'Right'): Pose => { const b = other(fwd); return { ...arms, bones: { Hips: [lean, 0, 0], Spine: [0, 0, 0], Neck: [6, 0, 0], [`${b}Foot`]: [16, 0, 0] } as Record<string, Deg3>, feet: { [fwd]: [sx(fwd, 0.12), ANKLE, 0.16], [b]: [sx(b, 0.12), ANKLE + 0.04, -0.20] } as Pair, kneePoles: bothDir(0.05, 0, 1), hipsY: -0.08, hipsZ: 0.02 }; };
  const pass = (moving: 'Left' | 'Right'): Pose => { const o = other(moving); return { ...arms, bones: { Hips: [lean, 0, 0], Spine: [0, 0, 0], Neck: [6, 0, 0], [`${moving}UpLeg`]: [-24, 0, 0], [`${moving}Leg`]: [46, 0, 0], [`${moving}Foot`]: [10, 0, 0] } as Record<string, Deg3>, feet: { [o]: [sx(o, 0.12), ANKLE, -0.02] } as Pair, kneePoles: { [o]: [sx(o, 0.05), 0, 1] } as Pair, hipsY: -0.04, hipsZ: 0.0 }; };
  return run(scene, sk, name, 1.4, [at(stand('Left'), 0), at(pass('Left'), 0.35), at(stand('Right'), 0.7), at(pass('Right'), 1.05)]);
};

// ── upper-body stretches ──────────────────────────────────────────────────────────────────────────────────────────

const WALL_FACE = 0.69;
/** ex_lat_wall_stretch — facing the wall, the right forearm up on it above the head, elbow bent: the chest eases down and
 *  toward the wall, the hips back, until the side of the back stretches; held, and up. */
const latWallStretch: Builder = (scene, sk) => {
  const up: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, 0.12), kneePoles: bothDir(0.05, 0, 1), handsAt: { Right: [0.10, 1.86, WALL_FACE - 0.04] }, rel: { Left: [0.04, -0.42, 0.08] }, poles: { Right: [0.4, -0.2, 0.2], Left: HIPS_POLES.Left }, hipsY: 0 };
  const lean: Pose = { ...up, bones: { Hips: [26, 0, 0], Spine: [4, 0, 6], Neck: [-10, 0, 0] }, kneePoles: bothDir(0.05, 0, 1), hipsY: -0.04, hipsZ: -0.10 };
  return run(scene, sk, 'ex_lat_wall_stretch', 6.0, [at(up, 0, true), at(up, 0.6, true), at(lean, 2.0, true), at(lean, 4.6, true)]);
};
/** The pole in both hands, a wide grip, palms down, arms long: `deg` 0 in front at the thighs, 90 straight overhead, about
 *  140 behind the head (the chest and front-of-shoulder stretch); −30 to −60 behind the hips, lifting (round the world). */
const pole = (deg: number): Pose => {
  const a = (deg * Math.PI) / 180, R = 0.62, sh = 1.42;
  return { bones: { ...STAND }, feet: both(0.11, ANKLE, 0.08), kneePoles: bothDir(0.05, 0, 1), hands: both(0.46, sh - R * Math.cos(a), R * Math.sin(a) * (deg > 90 ? 0.55 : 1) + 0.04), poles: bothDir(0.8, 0.2, -0.2), hipsY: 0 };
};
/** ex_pole_over — standing, the pole held wide in front at the thighs: the straight arms lift it up overhead and on behind
 *  the head as far as is easy, held, and back down. */
const poleOver: Builder = (scene, sk) => run(scene, sk, 'ex_pole_over', 6.0, [at(pole(4), 0, true), at(pole(50), 0.8), at(pole(95), 1.5), at(pole(135), 2.2, true), at(pole(135), 3.8, true), at(pole(95), 4.4), at(pole(50), 5.0)]);
/** ex_pole_behind — standing, the pole held wide behind the hips, palms down, thumbs out: the straight arms lift it up
 *  behind as far as is easy, held, and back down. */
const poleBehind: Builder = (scene, sk) => {
  const p = (lift: number): Pose => ({ bones: { ...STAND, Hips: [lift * 14, 0, 0], Neck: [-lift * 8, 0, 0] }, feet: both(0.11, ANKLE, 0.08), kneePoles: bothDir(0.05, 0, 1), hands: both(0.46, 0.92 + lift * 0.34, -0.18 - lift * 0.22), poles: bothDir(0.8, 0.3, 0.2), hipsY: -lift * 0.02 });
  return run(scene, sk, 'ex_pole_behind', 6.0, [at(p(0), 0, true), at(p(1), 1.8, true), at(p(1), 4.0, true)]);
};
/** ex_chair_chest_stretch — sitting on the edge of a chair, the hands gripping it behind the hips, arms straight: the chest
 *  pulls forward and up until the chest and the fronts of the shoulders stretch; held, and back. (assumption: the stage's
 *  bench has no back, so the hands grip its back edge.) */
const chairChestStretch: Builder = (scene, sk) => {
  const a = seat({ handsAt: both(0.15, 0.46, -0.22), poles: bothDir(0.3, 0, -1) });
  const b = seat({ bones: { Hips: [14, 0, 0], Spine: [-6, 0, 0], Neck: [6, 0, 0] }, handsAt: both(0.15, 0.46, -0.22), poles: bothDir(0.3, 0, -1) });
  return run(scene, sk, 'ex_chair_chest_stretch', 6.0, [at(a, 0, true), at(a, 0.6, true), at(b, 2.0, true), at(b, 4.6, true)], true);
};
/** ex_dancer_stretch — sitting on the floor, the left leg long, the right knee bent with its foot over beside the left
 *  knee: the left arm on the right knee and the right hand on the floor behind, the chest turns to the right, held. */
const dancerStretch: Builder = (scene, sk) => {
  const base: Pose = {
    bones: { Hips: [-6, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-86, 0, 0], LeftLeg: [4, 0, 0], LeftFoot: [20, 0, 0] },
    feet: { Right: [-0.10, ANKLE, 0.40] }, kneePoles: { Right: [0.1, 1, 0.4] }, hands: { Left: [0.04, 0.40, 0.30], Right: [0.20, 0.05, -0.22] }, poles: { Left: [-0.4, -0.6, 0.6], Right: [0.4, 0, -1] }, hipsY: -0.80,
  };
  const turned: Pose = { ...base, bones: { ...base.bones, Spine: [0, -14, 0], Spine1: [0, -12, 0], Neck: [0, -24, 0] } };
  return run(scene, sk, 'ex_dancer_stretch', 6.0, [at(base, 0, true), at(base, 0.6, true), at(turned, 2.0, true), at(turned, 4.8, true)], true);
};

export const FAMILY8_BUILDERS: readonly [string, Builder][] = [
  ['ex_ankle_reset', ankleReset], ['ex_ankle_unlock', ankleUnlock], ['ex_quad_t_rot', quadTRot], ['ex_ninety_turn', ninetyTurn], ['ex_bw_hinge', bwHinge], ['ex_knee_across', kneeAcross],
  ['ex_zottman', zottman], ['ex_cross_hammer', crossHammer], ['ex_drag_curl', dragCurl], ['ex_concentration_stand', concentrationStand], ['ex_lying_cable_curl', lyingCableCurl], ['ex_lying_db_curl', lyingDbCurl],
  ['ex_pec_deck', pecDeck], ['ex_crossover', crossover], ['ex_crossover_low', crossoverLow], ['ex_crossover_one', crossoverOne], ['ex_iron_cross', ironCross], ['ex_band_crossover', bandCrossover], ['ex_svend_press', svendPress], ['ex_raise_pullover', raisePullover],
  ['ex_tate_press', tatePress], ['ex_jm_press', jmPress], ['ex_machine_triceps', machineTriceps],
  ['ex_kneel_arm_drill', kneelArmDrill], ['ex_sled_push', sledPush], ['ex_sled_drag_back', sledDragBack('ex_sled_drag_back', false)], ['ex_sled_overhead_back', sledDragBack('ex_sled_overhead_back', true)],
  ['ex_lat_wall_stretch', latWallStretch], ['ex_pole_over', poleOver], ['ex_pole_behind', poleBehind], ['ex_chair_chest_stretch', chairChestStretch], ['ex_dancer_stretch', dancerStretch],
];
