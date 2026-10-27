// Exercise loops, BATCH B6 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the last thirteen non-hoops loops: ranks
// 78–90). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// One representative loop per id (named in each doc comment). One-sided movements are authored on one side and mirrored
// in-loop (exerciseKit.alternate). ex_pullover uses the 'bench' prop; ex_calf_raise_seated the 'seat' box.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, loop, rep, mix, alternate, seat, lie, HIGH_PLANK,
  STANCE, HANG, HANG_POLES, ELBOWS_OUT, ELBOWS_BACK, STAND,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_foam_roll — the hamstring / calf roll: sitting back on the floor, the hands planted behind, the hips just off the floor and
 *  the legs long over the roller (not drawn), the body rocks slowly so the legs travel over it (foam-roll / SMR entries play it;
 *  one floor pose cannot show every muscle's position). */
export function buildExFoamRoll(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands = both(0.20, 0.04, -0.34);
  const pose = (rock: number): K => ({ bones: { Hips: [-52 + rock, 0, 0], Spine: [6, 0, 0], Neck: [14, 0, 0], LeftUpLeg: [-36 - rock, 0, 3], RightUpLeg: [-36 - rock, 0, -3], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, hands, poles: bothDir(0.3, 0.2, -1), hipsY: -0.72 });
  const a = pose(-5), b = pose(6);
  return loop(scene, sk, 'ex_foam_roll', 3.2, [at(a, 0, true), at(mix(a, b, 0.5), 0.75), at(b, 1.5, true), at(b, 1.7, true), at(mix(b, a, 0.5), 2.45)]);
}

/** ex_curl_alt — the alternating dumbbell curl: the elbows still at the sides, the right hand curls up and lowers, then the left
 *  (alternating biceps / hammer curls, seated or standing). */
export function buildExCurlAlt(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down: K = { bones: STAND, feet: STANCE, hands: both(0.22, 0.86, 0.10), poles: ELBOWS_BACK, hipsY: 0 };
  const up: K = { ...down, hands: { Left: [-0.22, 0.86, 0.10], Right: [0.20, 1.34, 0.20] }, poles: { Left: ELBOWS_BACK.Left, Right: [0.15, -0.8, -0.6] } };
  return loop(scene, sk, 'ex_curl_alt', 3.2, alternate([at(down, 0, true), at(mix(down, up, 0.5), 0.4), at(up, 0.8, true), at(up, 0.95, true), at(mix(up, down, 0.5), 1.3)], 1.6));
}

/** ex_pullover — the dumbbell pullover lying on the bench: the arms long above the chest, they lower in an arc behind the head
 *  until level with the bench, and pull back over (straight- / bent-arm pullovers, Svend press plays it). Lies on the 'bench'. */
export function buildExPullover(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top = lie({ hands: both(0.08, 1.06, -0.48), poles: bothDir(0.6, 0, 0.6) });
  const mid = lie({ hands: both(0.08, 0.96, -0.86), poles: bothDir(0.6, 0.4, 0.4) });
  const low = lie({ hands: both(0.08, 0.62, -1.04), poles: bothDir(0.6, 0.6, 0) });
  return loop(scene, sk, 'ex_pullover', 3.0, [at(top, 0, true), at(mid, 0.6), at(low, 1.1, true), at(low, 1.35, true), at(mid, 1.9), at(top, 2.5, true)]);
}

/** ex_face_pull — the face pull: the arms long in front at face height, pull the hands to either side of the face, the elbows
 *  out and a little below the hands, squeeze, and reach again (cable / band face pulls, pull-aparts, rear-delt rows). */
export function buildExFacePull(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.10);
  const bones = { ...STAND, Hips: [-4, 0, 0] as Deg3 };
  const reach: K = { bones, feet, rel: { Left: [0.12, 0.04, 0.50], Right: [-0.12, 0.04, 0.50] }, poles: bothDir(0.6, -0.6, -0.4), hipsY: 0 };
  const pulled: K = { bones, feet, rel: { Left: [0.05, 0.06, 0.16], Right: [-0.05, 0.06, 0.16] }, poles: bothDir(0.6, -1, -0.3), hipsY: 0 };
  return rep(scene, sk, 'ex_face_pull', reach, pulled, 0.8, 0.4, 1.0, 0.3);
}

/** ex_triceps_kickback — the two-arm dumbbell kickback: hinged to about 50°, the upper arms tight along the ribs, the forearms
 *  hang, then extend straight back and return (kickbacks, bent-over triceps extensions). */
export function buildExTricepsKickback(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.16);
  const bones = { Hips: [50, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-26, 0, 0] as Deg3, LeftLeg: [18, 0, 0] as Deg3, RightLeg: [18, 0, 0] as Deg3 };
  const bent: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.42, -0.20], Right: [-0.04, -0.42, -0.20] }, poles: bothDir(0.1, 0.6, -0.8), hipsY: -0.08 };
  const ext: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.33, -0.40], Right: [-0.04, -0.33, -0.40] }, poles: bothDir(0.1, 0.8, -0.4), hipsY: -0.08 };
  return rep(scene, sk, 'ex_triceps_kickback', bent, ext, 0.6, 0.4, 0.8, 0.3);
}

/** ex_lunge_walking — the walking lunge shown in place: the left foot steps forward into a lunge, drives back to standing, then
 *  the right (walking lunges, lunge with rotation / overhead reach; the body does not travel — the root never moves). */
export function buildExLungeWalking(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const stepZ = 0.62;
  const home: Pair = both(0.12, ANKLE, 0.04);
  const out: V3 = [-0.13, ANKLE, 0.04 + stepZ];
  const air: V3 = [-0.13, ANKLE + 0.12, 0.04 + stepZ * 0.55];
  const lowF: Pair = { Left: out, Right: [0.12, ANKLE + 0.05, 0.04] };
  const knees: Pair = { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] };
  const hands = (drop: number): Pair => both(0.24, 0.84 - drop, 0.06);
  const stand: K = { bones: STAND, feet: home, hands: hands(0), poles: HANG_POLES, hipsY: 0 };
  const step: K = { bones: { ...STAND, LeftUpLeg: [-40, 0, 0] }, feet: { Left: air, Right: home.Right }, kneePoles: bothDir(0, 0, 1), hands: hands(0.02), poles: HANG_POLES, hipsY: -0.02 };
  const land: K = { bones: { ...STAND, Spine: [6, 0, 0], RightFoot: [10, 0, 0], LeftFoot: [14, 0, 0] }, feet: lowF, kneePoles: knees, hands: hands(0.12), poles: HANG_POLES, hipsY: -0.14 };
  const bottom: K = { bones: { ...STAND, Spine: [6, 0, 0], RightFoot: [-6, 0, 0], LeftFoot: [22, 0, 0] }, feet: lowF, kneePoles: knees, hands: hands(0.40), poles: HANG_POLES, hipsY: -0.42 };
  const back: K = { ...step, hipsY: -0.03, hands: hands(0.03) };
  return loop(scene, sk, 'ex_lunge_walking', 5.2, alternate([
    at(stand, 0, true), at(step, 0.35), at(land, 0.7), at(mix(land, bottom, 0.5), 0.92), at(bottom, 1.15, true), at(bottom, 1.45, true),
    at({ ...mix(bottom, land, 0.5), bones: { ...mix(bottom, land, 0.5).bones, LeftFoot: [4, 0, 0] } }, 1.62), at({ ...mix(land, back, 0.5), bones: { ...mix(land, back, 0.5).bones, LeftFoot: [-16, 0, 0], RightFoot: [-12, 0, 0] }, feet: { Left: [-0.13, ANKLE + 0.10, 0.04 + stepZ * 0.8], Right: home.Right } }, 1.76), at(back, 1.9), at(stand, 2.25, true),
  ], 2.6));
}

/** ex_calf_raise_single — the single-leg calf raise: standing on the right foot, the left foot hooked behind the ankle, the right
 *  hand on a wall (not drawn), up onto the toes and slowly down; then the left (single-leg / step / eccentric calf raises). */
export function buildExCalfRaiseSingle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const wall: V3 = [0.46, 1.20, 0.24];
  const free = { LeftUpLeg: [4, 0, 0] as Deg3, LeftLeg: [70, 0, 0] as Deg3, LeftFoot: [20, 0, 0] as Deg3 };
  const down: K = { bones: { ...STAND, ...free }, feet: { Right: [0.10, ANKLE, 0.06] }, hands: { Right: wall, Left: [-0.24, 0.84, 0.06] }, poles: { Right: [0.6, -0.6, -0.4], Left: HANG_POLES.Left }, hipsY: 0 };
  const up: K = { ...down, bones: { ...STAND, ...free, RightFoot: [34, 0, 0] }, feet: { Right: [0.10, ANKLE + 0.09, 0.06] }, hands: { Right: wall, Left: [-0.24, 0.93, 0.06] }, hipsY: 0.09 };
  const stand: K = { bones: STAND, feet: both(0.10, ANKLE, 0.06), hands: HANG, poles: HANG_POLES, hipsY: 0 };
  return loop(scene, sk, 'ex_calf_raise_single', 4.4, alternate([
    at(stand, 0, true), at(down, 0.35, true), at(mix(down, up, 0.5), 0.6), at(up, 0.85, true), at(up, 1.1, true), at(mix(up, down, 0.5), 1.5), at(down, 1.85, true),
  ], 2.2));
}

/** ex_neck — the neck series standing tall: the chin nods down and the head tips back, then the ear tips toward each shoulder,
 *  each held a beat (neck isometrics, chin nods / tucks, harness and plate neck work play it). */
export function buildExNeck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const pose = (pitch: number, roll: number): K => ({ bones: { ...STAND, Neck: [pitch, 0, roll], Head: [pitch * 0.6, 0, roll * 0.6] }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 });
  const n = pose(0, 0);
  return loop(scene, sk, 'ex_neck', 6.4, [
    at(n, 0, true), at(pose(16, 0), 0.6, true), at(pose(16, 0), 1.0, true), at(n, 1.6), at(pose(-14, 0), 2.2, true), at(pose(-14, 0), 2.6, true),
    at(n, 3.2, true), at(pose(0, 16), 3.8, true), at(pose(0, 16), 4.2, true), at(n, 4.8), at(pose(0, -16), 5.4, true), at(pose(0, -16), 5.8, true),
  ]);
}

/** ex_curl_hammer — the cross-body hammer curl: the thumbs up, the right hand curls across toward the left shoulder and lowers,
 *  then the left (cross-body / rope hammer curls). */
export function buildExCurlHammer(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down: K = { bones: STAND, feet: STANCE, hands: both(0.22, 0.86, 0.10), poles: ELBOWS_BACK, hipsY: 0 };
  const up: K = { ...down, hands: { Left: [-0.22, 0.86, 0.10], Right: [-0.02, 1.28, 0.24] }, poles: { Left: ELBOWS_BACK.Left, Right: [0.4, -0.8, -0.4] } };
  return loop(scene, sk, 'ex_curl_hammer', 3.2, alternate([at(down, 0, true), at(mix(down, up, 0.5), 0.4), at(up, 0.8, true), at(up, 0.95, true), at(mix(up, down, 0.5), 1.3)], 1.6));
}

/** ex_pushdown_variants — the rope pushdown: elbows pinned, the hands press down and split apart past the thighs at the bottom,
 *  and come back up together (rope / V-bar / incline pushdowns; the cable not drawn). */
export function buildExPushdownVariants(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const bones = { ...STAND, Hips: [10, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Neck: [-8, 0, 0] as Deg3 };
  const up: K = { bones, feet: STANCE, hands: both(0.08, 1.10, 0.32), poles: ELBOWS_BACK, hipsY: -0.02 };
  const down: K = { bones, feet: STANCE, hands: both(0.24, 0.82, 0.16), poles: ELBOWS_BACK, hipsY: -0.02 };
  return rep(scene, sk, 'ex_pushdown_variants', up, down, 0.7, 0.3, 0.9, 0.3);
}

/** ex_burpee — the burpee: squat down and plant the hands, jump the feet back to a high plank, jump them in, stand and hop with
 *  the arms up (burpees, squat thrusts, burpee intervals; seal jacks play it). */
export function buildExBurpee(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands = both(0.24, 0.05, 0.44);
  const stand: K = { bones: STAND, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const squat: K = { bones: { Hips: [62, 0, 0], Spine: [10, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: both(0.14, ANKLE + 0.02, 0.06), kneePoles: bothDir(0.3, 0, 1), hands, poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.56 };
  const tuck: K = { ...squat, bones: { ...squat.bones, Hips: [64, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] }, feet: both(0.13, 0.20, -0.16), kneePoles: bothDir(0.3, 0.2, 1), hipsY: -0.50 };
  const kick: K = { bones: { Hips: [66, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [10, 0, 0] }, feet: both(0.12, 0.30, -0.74), kneePoles: bothDir(0, -1, 0.1), hands, poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.52 };
  const plank: K = { ...HIGH_PLANK, hands };
  const air: K = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [10, 0, 0], RightLeg: [10, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, hands: both(0.20, 2.05 + 0.12, 0.10), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.12 };
  const land: K = { bones: { Hips: [16, 0, 0], Spine: [8, 0, 0], Neck: [-8, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.92 - 0.16, 0.30), poles: HANG_POLES, hipsY: -0.16 };
  const flex = (e: K): K => ({ ...e, bones: { ...e.bones, LeftFoot: [-38, 0, 0], RightFoot: [-38, 0, 0] } });
  return loop(scene, sk, 'ex_burpee', 3.4, [
    at(stand, 0, true), at(flex(mix(stand, squat, 0.5)), 0.25), at(squat, 0.5, true), at(tuck, 0.6), at(kick, 0.72), at(plank, 0.88, true), at(plank, 1.2, true), at(kick, 1.36), at(tuck, 1.48), at(squat, 1.6, true),
    at(flex(mix(squat, stand, 0.5)), 1.9), at(flex(mix(squat, stand, 0.8)), 2.05), at(stand, 2.15), at({ ...mix(stand, air, 0.5), hands: both(0.22, 1.50, 0.42), poles: bothDir(0.4, -0.6, -0.6) }, 2.28), at(air, 2.4), at(air, 2.55), at(land, 2.8, true), at(stand, 3.1, true),
  ]);
}

/** ex_calf_raise_seated — the seated calf raise: sitting on the box, the hands on the knees (the load), the heels lift high and
 *  lower slowly (seated / dumbbell seated calf raises; calf press and donkey raises play it). Sits on the 'seat' prop. */
export function buildExCalfRaiseSeated(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down = seat({ bones: { Hips: [8, 0, 0] }, hands: both(0.17, 0.60, 0.42), poles: bothDir(0.6, 0, -0.6) });
  const up = seat({ bones: { Hips: [8, 0, 0], LeftFoot: [36, 0, 0], RightFoot: [36, 0, 0] }, feet: both(0.19, ANKLE + 0.09, 0.48), hands: both(0.17, 0.68, 0.42), poles: bothDir(0.6, 0, -0.6) });
  return rep(scene, sk, 'ex_calf_raise_seated', down, up, 0.6, 0.5, 0.9, 0.3);
}

/** ex_tib_raise — the wall tibialis raise: the back leaning on a wall (not drawn), the feet a step out in front, the toes pull up
 *  toward the shins, the heels staying down, and lower (wall / band / seated tib raises; heel walks play it). */
export function buildExTibRaise(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.12, ANKLE, 0.34);
  const pose = (toes: number): K => ({ bones: { ...STAND, Hips: [-8, 0, 0], Neck: [6, 0, 0], LeftFoot: [-toes, 0, 0], RightFoot: [-toes, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.80, -0.08), poles: HANG_POLES, hipsY: -0.04 });
  return rep(scene, sk, 'ex_tib_raise', pose(0), pose(28), 0.5, 0.4, 0.8, 0.3);
}

/** Batch B6: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B6_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_foam_roll', buildExFoamRoll], ['ex_curl_alt', buildExCurlAlt], ['ex_pullover', buildExPullover], ['ex_face_pull', buildExFacePull],
  ['ex_triceps_kickback', buildExTricepsKickback], ['ex_lunge_walking', buildExLungeWalking], ['ex_calf_raise_single', buildExCalfRaiseSingle], ['ex_neck', buildExNeck],
  ['ex_curl_hammer', buildExCurlHammer], ['ex_pushdown_variants', buildExPushdownVariants], ['ex_burpee', buildExBurpee], ['ex_calf_raise_seated', buildExCalfRaiseSeated],
  ['ex_tib_raise', buildExTibRaise],
];
export const EXERCISE_BATCH_B6_CLIPS: readonly string[] = EXERCISE_BATCH_B6_BUILDERS.map(([n]) => n);
