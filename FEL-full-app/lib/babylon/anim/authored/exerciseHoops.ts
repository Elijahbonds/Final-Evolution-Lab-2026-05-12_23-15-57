// The ball-skill drills' own loops (DEMO-LOOPS-6, 2026-11-03): platform P9's camera drills (lib/drills/hoopsDrills.ts) are
// done IN PLACE, in a room, so where a court clip travels or the drill's movement is its own, the loop is authored here from
// the drill's blurb and cues: the 1-2 step into the shot, the layup footwork, the rip-through, the rebound to the chin. The
// rest reuse the loops and court clips that already ARE the movement (lib/library/surfaceDemo.ts DRILL_DEMO_LOOPS). The
// ball is not drawn (demo.ts isBallClip: the stage says so). Shooting poses: exerciseSignature.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, both, bothDir, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { run, at } from './exerciseBody';
import { AT_CHEST, RELEASE, SET_POINT, jumpShotAir, shooter } from './exerciseSignature';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

/** a foot lifted off the floor in place (the 1-2 step, the layup's steps): the thigh up a little, the knee bent */
const lift = (side: 'Left' | 'Right', h = 1): Record<string, Deg3> => ({ [`${side}UpLeg`]: [-34 * h, 0, 0], [`${side}Leg`]: [56 * h, 0, 0], [`${side}Foot`]: [16, 0, 0] });

/** ex_catch_shoot_12 (Catch and Shoot) — in place: the left foot steps, the right foot steps (the 1-2), the hands meet at the
 *  chest for the catch as the knees dip; straight up into the shot, released high and held; down. */
const catchShoot12: Builder = (scene, sk) => {
  const ready = shooter({ Right: [0.24, 0.92, 0.12], Left: [-0.24, 0.92, 0.12] }, 0.3, 0);
  const stepL: Pose = { ...ready, bones: { ...ready.bones, ...lift('Left') }, feet: { Right: ready.feet!.Right }, kneePoles: { Right: [0.12, 0, 1] }, hipsY: (ready.hipsY ?? 0) + 0.01 };
  const stepR: Pose = { ...ready, bones: { ...ready.bones, ...lift('Right') }, feet: { Left: ready.feet!.Left }, kneePoles: { Left: [-0.12, 0, 1] }, hands: { Right: [0.20, 1.10, 0.36], Left: [-0.20, 1.10, 0.38] }, hipsY: (ready.hipsY ?? 0) + 0.01 };
  return run(scene, sk, 'ex_catch_shoot_12', 4.0, [
    at(ready, 0, true), at(stepL, 0.3), at(ready, 0.5), at(stepR, 0.75), at(shooter(AT_CHEST, 1, 0), 1.0, true),
    at(shooter(SET_POINT, 0.2, 0.6), 1.22), at(jumpShotAir(0, 0.18, RELEASE), 1.45, true), at(jumpShotAir(0, 0.18, RELEASE), 1.6, true),
    at(shooter(RELEASE, 0.7, 0), 1.9, true), at(shooter(RELEASE, 0.1, 0), 2.6, true), at(ready, 3.4, true),
  ], true);
};

/** ex_layup_steps (Layup Footwork) — in place: right, left, then the right knee drives up as the right hand reaches high
 *  (the right-hand layup's last step), a beat at the top, and down. */
const layupSteps: Builder = (scene, sk) => {
  const ball: Pair = { Right: [0.20, 1.02, 0.26], Left: [-0.16, 1.04, 0.28] };
  const stance: Pose = { bones: { ...STAND, Hips: [8, 0, 0] }, feet: both(0.12, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: ball, poles: bothDir(0.6, -0.8, -0.2), hipsY: -0.03 };
  const stepR: Pose = { ...stance, bones: { ...stance.bones, ...lift('Right') }, feet: { Left: stance.feet!.Left }, kneePoles: { Left: [-0.1, 0, 1] } };
  const stepL: Pose = { ...stance, bones: { ...stance.bones, ...lift('Left') }, feet: { Right: stance.feet!.Right }, kneePoles: { Right: [0.1, 0, 1] } };
  const finish: Pose = {
    bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-10, 0, 0], RightUpLeg: [-84, 0, 0], RightLeg: [92, 0, 0], RightFoot: [10, 0, 0], LeftFoot: [30, 0, 0] },
    feet: { Left: [-0.10, ANKLE + 0.08, 0.06] }, kneePoles: { Left: [-0.05, 0, 1] }, hands: { Right: [0.16, 2.10, 0.30], Left: [-0.20, 1.40, 0.24] }, poles: { Right: [0.6, -0.6, -0.2], Left: [-0.8, -0.4, 0.2] }, hipsY: 0.08,
  };
  return run(scene, sk, 'ex_layup_steps', 3.4, [
    at(stance, 0, true), at(stepR, 0.3), at(stance, 0.5), at(stepL, 0.75), at(stance, 0.95), at(finish, 1.3, true), at(finish, 1.6, true), at(stance, 2.4, true),
  ], true);
};

/** ex_rip_through (Rip-Through) — low and still in triple threat, the ball at the right hip: sweep it low across the knees to
 *  the left hip, and step through with the right foot across, the ball kept low; step back to triple threat. */
const ripThrough: Builder = (scene, sk) => {
  const low = (hands: Pair, extra: Partial<Pose> = {}): Pose => ({ bones: { Hips: [26, 0, 0], Spine: [8, 0, 0], Neck: [-20, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: both(0.18, ANKLE, 0.06), kneePoles: bothDir(0.2, 0, 1), hands, poles: bothDir(0.6, -0.6, -0.3), hipsY: -0.18, ...extra });
  const hipR: Pair = { Right: [0.24, 0.84, 0.18], Left: [0.10, 0.86, 0.26] };
  const knees: Pair = { Right: [0.04, 0.56, 0.38], Left: [-0.12, 0.58, 0.36] };
  const hipL: Pair = { Right: [-0.10, 0.80, 0.26], Left: [-0.26, 0.82, 0.16] };
  const through = low({ Right: [-0.16, 0.66, 0.40], Left: [-0.30, 0.68, 0.30] }, { bones: { Hips: [30, -14, 0], Spine: [8, -8, 0], Neck: [-20, 10, 0], LeftFoot: [-26, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.18, ANKLE, 0.06], Right: [-0.24, ANKLE, 0.52] }, kneePoles: { Left: [-0.2, 0, 1], Right: [-0.3, 0, 1] }, hipsX: -0.10, hipsZ: 0.18, hipsY: -0.20 });
  return run(scene, sk, 'ex_rip_through', 3.6, [
    at(low(hipR), 0, true), at(low(knees), 0.35), at(low(hipL), 0.6, true), at(through, 1.1, true), at(through, 1.5, true), at(low(hipL), 2.3, true), at(low(knees), 2.7), at(low(hipR), 3.0, true),
  ], true);
};

/** ex_rebound_chin (Rebound and Chin) — load (a dip, the arms swung back), go up with both hands reaching high, land on both
 *  feet wide, and pull the ball down to the chin, the elbows out; hold it, stand. */
const reboundChin: Builder = (scene, sk) => {
  const stand: Pose = { bones: { ...STAND, Hips: [6, 0, 0] }, feet: both(0.15, ANKLE, 0.06), kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 1.02, 0.24), poles: bothDir(0.6, -0.8, 0), hipsY: -0.03 };
  const load: Pose = { bones: { Hips: [26, 0, 0], Spine: [12, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: both(0.15, ANKLE, 0.06), kneePoles: bothDir(0.2, 0, 1), hands: both(0.26, 0.66, -0.28), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.26 };
  const legs = { LeftUpLeg: [-8, 0, 4] as Deg3, RightUpLeg: [-8, 0, -4] as Deg3, LeftLeg: [12, 0, 0] as Deg3, RightLeg: [12, 0, 0] as Deg3, LeftFoot: [30, 0, 0] as Deg3, RightFoot: [30, 0, 0] as Deg3 };
  const air: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-14, 0, 0], ...legs }, hands: both(0.12, 2.22, 0.20), poles: bothDir(0.8, 0.1, -0.3), hipsY: 0.22 };
  const chin: Pose = { bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet: both(0.22, ANKLE, 0.06), kneePoles: bothDir(0.3, 0, 1), hands: both(0.10, 1.18, 0.24), poles: bothDir(1, 0.1, 0.1), hipsY: -0.20 };
  return run(scene, sk, 'ex_rebound_chin', 3.6, [
    at(stand, 0, true), at(load, 0.45, true), at(air, 0.8, true), at(air, 0.95, true), at(chin, 1.25, true), at(chin, 2.3, true), at(stand, 3.0, true),
  ], true);
};

export const HOOPS_DRILL_BUILDERS: readonly [string, Builder][] = [
  ['ex_catch_shoot_12', catchShoot12], ['ex_layup_steps', layupSteps], ['ex_rip_through', ripThrough], ['ex_rebound_chin', reboundChin],
];
