// Exercise loops, BATCH C1 (FITNESS-TPOSE loop plan 2026-10-26, tier 4: the basketball loops released for Fitness — ranks 18,
// 21, 24, 25, 36). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// The stage draws no ball (demo.ts isBallClip puts the note on the card), so the HANDS carry it: a cupped dribble hand that
// flexes down through the push and cocks back to receive, the set-shot pocket (the shooting wrist cocked back, palm up under
// the ball, the guide hand on its side), the goose-neck follow-through. Wrists are keyed on the Hand bone, measured on all five
// bodies in the harness (each hand's finger line and ballRig's palm normal carried by its world matrix): RightHand euler y
// bends the fingers toward the front of the forearm's line (+55 on a dribble arm: fingers forward, palm down on the ball;
// +70 at the set point: fingers back, palm up under it), x turns the palm about the fingers (−100 with y +60 on the
// extended shooting arm: the fingers over and down, palm to the floor). `wr` writes the right hand's value and the left's
// mirror ([x, −y, −z], exerciseKit.mirrorKey's rule), so a pose and its mirrored half bend both wrists the same way.
// The way a loop travels is drawn on the floor in volt (demo.ts DEMO_ARROWS), since the root stays in place.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, both, bothDir, loop, mix, alternate, type ExKey, type Pair, type V3, type Deg3 } from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });
/** The two wrists: the right hand's euler and the left's, written in right-hand terms and mirrored ([x, −y, −z]). */
export const wr = (r: Deg3, l: Deg3 = [0, 0, 0]): Record<string, Deg3> => ({ RightHand: r, LeftHand: [l[0], -l[1], -l[2]] });
const TOP: Deg3 = [0, 55, 0], PUSH: Deg3 = [0, 20, 0], POCKET: Deg3 = [0, 70, 0], SNAP: Deg3 = [-100, 60, 0];

// the athletic stance: feet a bit wider than the hips, knees bent, the chest over the toes
const FEET: Pair = both(0.17, ANKLE, 0.06);
const STANCE_BONES: Record<string, Deg3> = { Hips: [20, 0, 0], Spine: [4, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] };
const KNEES: Pair = bothDir(0.25, 0, 1);
const GUARD_L: V3 = [-0.22, 1.06, 0.30], GUARD_R: V3 = [0.22, 1.06, 0.30];
const POLES: Pair = { Left: [-0.4, -0.7, -0.5], Right: [0.4, -0.7, -0.5] };
/** One right-hand dribble beat: the hand on top of the ball (wrist cocked back to meet it) or at the bottom of the push. */
const dribbleR = (down: boolean, extra: Record<string, Deg3> = {}, hipsY = -0.14): K => ({
  bones: { ...STANCE_BONES, ...wr(down ? PUSH : TOP), ...extra }, feet: FEET, kneePoles: KNEES,
  hands: { Right: down ? [0.32, 0.68, 0.28] : [0.31, 0.84, 0.25], Left: GUARD_L }, poles: POLES, hipsY: down ? hipsY - 0.02 : hipsY,
});
const flightLegs: Record<string, Deg3> = { LeftUpLeg: [-8, 0, 3], RightUpLeg: [-8, 0, -3], LeftLeg: [12, 0, 0], RightLeg: [12, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] };
/** The jumper's frames: the dip with the ball in the pocket, the set point, the release at the top, the follow-through. */
const dip: K = { bones: { Hips: [24, 0, 0], Spine: [6, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0], ...wr([0, 50, 0]) }, feet: FEET, kneePoles: KNEES, hands: { Right: [0.15, 1.00, 0.30], Left: [0.01, 1.02, 0.34] }, poles: { Left: [-0.6, -0.6, -0.4], Right: [0.3, -0.8, -0.3] }, hipsY: -0.26 };
const setPt: K = { bones: { Hips: [6, 0, 0], Spine: [0, 0, 0], Neck: [-4, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-6, 0, 0], ...wr(POCKET) }, feet: FEET, kneePoles: KNEES, hands: { Right: [0.15, 1.68, 0.20], Left: [0.00, 1.70, 0.24] }, poles: { Left: [-0.9, -0.3, -0.2], Right: [0.2, -0.6, 0.6] }, hipsY: -0.10 };
const rise: K = { bones: { Hips: [2, 0, 0], Spine: [-2, 0, 0], Neck: [-4, 0, 0], ...flightLegs, ...wr(POCKET) }, hands: { Right: [0.15, 1.92, 0.20], Left: [0.00, 1.94, 0.24] }, poles: { Left: [-0.9, -0.3, -0.2], Right: [0.2, -0.6, 0.6] }, hipsY: 0.10 };
const release: K = { bones: { Hips: [2, 0, 0], Spine: [-2, 0, 0], Neck: [-6, 0, 0], ...flightLegs, ...wr(SNAP) }, hands: { Right: [0.16, 2.18, 0.46], Left: [-0.06, 1.96, 0.28] }, poles: { Left: [-0.9, -0.3, -0.2], Right: [0.3, -0.4, 0.6] }, hipsY: 0.16 };
const fall: K = { ...release, bones: { ...release.bones, LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0], LeftFoot: [18, 0, 0], RightFoot: [18, 0, 0] }, hands: { Right: [0.16, 2.08, 0.44], Left: [-0.06, 1.86, 0.28] }, hipsY: 0.07 };
const land: K = { bones: { Hips: [16, 0, 0], Spine: [4, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0], ...wr([-100, 40, 0]) }, feet: FEET, kneePoles: KNEES, hands: { Right: [0.16, 1.50, 0.44], Left: [-0.14, 1.20, 0.32] }, poles: { Left: [-0.4, -0.8, -0.4], Right: [0.3, -0.4, 0.6] }, hipsY: -0.20 };

/** ex_bball_pullup — the pull-up jumper: two right-hand dribbles, pick it up into the shot pocket on the dip, rise to the set
 *  point, release at the top with the wrist snapped through, land on the spot and get the ball back (off-the-dribble
 *  shooting from every spot, the strong and weak sides play it; a forward arrow on the floor for the attack). */
export function buildExBballPullup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const recover: K = { ...dribbleR(false), bones: { ...STANCE_BONES, ...wr([0, 20, 0]) }, hands: { Right: [0.24, 1.00, 0.30], Left: GUARD_L } };
  return loop(scene, sk, 'ex_bball_pullup', 3.6, [
    at(dribbleR(false), 0), at(dribbleR(true), 0.25), at(dribbleR(false), 0.5), at(dribbleR(true), 0.75),
    at(dip, 1.05, true), at(mix(dip, setPt, 0.5), 1.22), at(setPt, 1.38), at(rise, 1.52), at(release, 1.68, true), at(release, 1.8, true), at(fall, 1.95), at(land, 2.12, true),
    at(mix(land, recover, 0.5), 2.45), at(recover, 2.8), at(dribbleR(true), 3.1), at(dribbleR(false), 3.35),
  ]);
}

/** ex_bball_handle_combo — the crossover combination in place: a pound with the right, the low cross in front, the left hand
 *  takes it and pounds, crosses back (crossover / between / behind / hesi combos and full-court handles play this one;
 *  volt arrows on the floor show the ball changing sides). */
export function buildExBballHandleCombo(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const yaw = (y: number): Record<string, Deg3> => ({ Hips: [20, y, 0], Spine: [4, -y * 0.5, 0] });
  const top = dribbleR(false, yaw(6)), push = dribbleR(true, yaw(6));
  const cross: K = { ...push, bones: { ...STANCE_BONES, ...yaw(0), ...wr(PUSH) }, hands: { Right: [0.05, 0.56, 0.38], Left: [-0.18, 0.92, 0.30] }, hipsY: -0.20 };
  const take: K = { bones: { ...STANCE_BONES, ...yaw(-4), ...wr([0, 0, 0], TOP) }, feet: FEET, kneePoles: KNEES, hands: { Right: GUARD_R, Left: [-0.30, 0.74, 0.27] }, poles: POLES, hipsY: -0.17 };
  return loop(scene, sk, 'ex_bball_handle_combo', 2.0, alternate([at(top, 0), at(push, 0.2), at(top, 0.4), at(cross, 0.62), at(take, 0.82)], 1.0));
}

/** ex_bball_catch_shoot — the catch-and-shoot: the hands up as a target, the catch into the shot pocket with the dip, rise,
 *  release, land, the hands back up (spot-up, off-screen catches, shooting footwork and free throws play it; a short forward
 *  arrow for the step into the catch). */
export function buildExBballCatchShoot(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const target: K = { bones: { ...STANCE_BONES, Hips: [14, 0, 0], ...wr([-90, 0, 0], [-90, 0, 0]) }, feet: FEET, kneePoles: KNEES, hands: { Right: [0.17, 1.18, 0.38], Left: [-0.17, 1.18, 0.38] }, poles: { Left: [-0.6, -0.7, -0.3], Right: [0.6, -0.7, -0.3] }, hipsY: -0.12 };
  return loop(scene, sk, 'ex_bball_catch_shoot', 3.0, [
    at(target, 0, true), at(target, 0.3, true), at(dip, 0.6, true), at(mix(dip, setPt, 0.5), 0.77), at(setPt, 0.93), at(rise, 1.07), at(release, 1.23, true), at(release, 1.35, true),
    at(fall, 1.5), at(land, 1.67, true), at(mix(land, target, 0.5), 2.1), at(target, 2.5, true),
  ]);
}

/** ex_bball_drive_finish — the right-hand drive and layup in place: dribble, the right foot attacks, the gather to the right hip,
 *  the left foot plants and the right knee drives up as the right hand lays it high off the glass, a two-foot landing (finish
 *  series, finishing drills and combo-into-finish entries play it; the long volt arrow is the drive). */
export function buildExBballDriveFinish(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const homeL: V3 = [-0.17, ANKLE, 0.06], homeR: V3 = [0.17, ANKLE, 0.06];
  const fwdR: V3 = [0.14, ANKLE, 0.30], plantL: V3 = [-0.12, ANKLE, 0.22];
  const attackFeet: Pair = { Left: homeL, Right: fwdR };
  const lift: K = { ...dribbleR(false), feet: { Left: homeL, Right: [0.16, ANKLE + 0.10, 0.20] } };
  const attack: K = { ...dribbleR(true, { Hips: [26, 0, 0], RightFoot: [-10, 0, 0] }, -0.18), feet: attackFeet, kneePoles: bothDir(0.1, 0, 1) };
  const gather: K = { bones: { Hips: [24, 0, 0], Spine: [6, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-6, 0, 0], ...wr([0, 40, 0]) }, feet: attackFeet, kneePoles: bothDir(0.1, 0, 1), hands: { Right: [0.20, 0.98, 0.30], Left: [0.04, 1.00, 0.36] }, poles: { Left: [-0.6, -0.6, -0.4], Right: [0.3, -0.8, -0.3] }, hipsY: -0.22 };
  const swingL: K = { ...gather, bones: { ...gather.bones, LeftFoot: [0, 0, 0] }, feet: { Right: fwdR, Left: [-0.13, ANKLE + 0.09, 0.16] }, hipsY: -0.18 };
  const plantBoth: K = { ...gather, bones: { ...gather.bones, Hips: [18, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [16, 0, 0], ...wr([0, 60, 0]) }, feet: { Left: plantL, Right: [0.14, ANKLE + 0.04, 0.30] }, hands: { Right: [0.18, 1.30, 0.34], Left: [-0.02, 1.30, 0.36] }, poles: { Left: [-0.8, -0.4, -0.3], Right: [0.3, -0.6, 0.5] }, hipsY: -0.16 };
  const driveK: K = { bones: { Hips: [12, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-6, 0, 0], RightUpLeg: [-50, 0, 0], RightLeg: [60, 0, 0], RightFoot: [10, 0, 0], ...wr([0, 60, 0]) }, feet: { Left: plantL, Right: [0.13, ANKLE + 0.22, 0.30] }, kneePoles: bothDir(0.1, 0, 1), hands: { Right: [0.18, 1.56, 0.34], Left: [-0.02, 1.54, 0.36] }, poles: { Left: [-0.8, -0.4, -0.3], Right: [0.3, -0.6, 0.5] }, hipsY: -0.06 };
  const up: K = { bones: { Hips: [4, 0, 0], Spine: [-2, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-6, 0, 3], LeftLeg: [20, 0, 0], LeftFoot: [30, 0, 0], RightUpLeg: [-84, 0, 0], RightLeg: [90, 0, 0], RightFoot: [20, 0, 0], ...wr([-100, 50, 0]) }, hands: { Right: [0.15, 2.28, 0.42], Left: [-0.18, 1.50, 0.34] }, poles: { Left: [-0.4, -0.8, -0.4], Right: [0.3, -0.4, 0.6] }, hipsY: 0.16 };
  const down: K = { ...up, bones: { ...up.bones, RightUpLeg: [-40, 0, 0], RightLeg: [50, 0, 0], LeftLeg: [24, 0, 0] }, hands: { Right: [0.16, 2.00, 0.42], Left: [-0.18, 1.40, 0.34] }, hipsY: 0.06 };
  const landK: K = { bones: { Hips: [18, 0, 0], Spine: [6, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0], ...wr([0, 0, 0]) }, feet: { Left: homeL, Right: homeR }, kneePoles: KNEES, hands: { Right: GUARD_R, Left: GUARD_L }, poles: POLES, hipsY: -0.24 };
  const touch: K = { ...landK, bones: { ...landK.bones, LeftFoot: [0, 0, 0], RightFoot: [0, 0, 0] }, feet: { Left: [-0.16, ANKLE + 0.06, 0.04], Right: [0.17, ANKLE + 0.06, 0.08] }, hands: { Right: [0.20, 1.40, 0.40], Left: [-0.20, 1.20, 0.34] }, poles: { Left: [-0.4, -0.8, -0.4], Right: [0.3, -0.4, 0.6] }, hipsY: -0.06 };
  return loop(scene, sk, 'ex_bball_drive_finish', 3.8, [
    at(dribbleR(false), 0), at(dribbleR(true), 0.25), at(lift, 0.45), at(attack, 0.65), at(gather, 0.95, true), at(swingL, 1.1), at(plantBoth, 1.24), at(driveK, 1.36),
    at(up, 1.52, true), at(up, 1.64, true), at(down, 1.8), at(touch, 1.92), at(landK, 2.04, true), at(landK, 2.25, true), at(mix(landK, dribbleR(false), 0.5), 2.7), at(dribbleR(false), 3.1), at(dribbleR(true), 3.4),
  ]);
}

/** ex_bball_v_dribble — the one-hand front V: the right hand pushes the ball down in front to the middle, meets it on the far side
 *  and pushes it back, twice; then the left hand (front / side V, wipers, pound and kill dribbles, two-ball pounds play it;
 *  the V is drawn on the floor in volt). */
export function buildExBballVDribble(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const at2 = (hand: V3, flex: Deg3, t: number, dropY = 0): ExKey => at({ bones: { ...STANCE_BONES, ...wr(flex) }, feet: FEET, kneePoles: KNEES, hands: { Right: hand, Left: GUARD_L }, poles: POLES, hipsY: -0.14 - dropY }, t);
  const outR: V3 = [0.30, 0.82, 0.26], mid: V3 = [0.05, 0.62, 0.40], farSide: V3 = [-0.06, 0.80, 0.34];
  return loop(scene, sk, 'ex_bball_v_dribble', 3.2, alternate([
    at2(outR, TOP, 0), at2(mid, PUSH, 0.2, 0.02), at2(farSide, TOP, 0.4), at2(mid, PUSH, 0.6, 0.02), at2(outR, TOP, 0.8), at2(mid, PUSH, 1.0, 0.02), at2(farSide, TOP, 1.2), at2(mid, PUSH, 1.4, 0.02),
  ], 1.6));
}

/** Batch C1: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_C1_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_bball_pullup', buildExBballPullup], ['ex_bball_handle_combo', buildExBballHandleCombo], ['ex_bball_catch_shoot', buildExBballCatchShoot],
  ['ex_bball_drive_finish', buildExBballDriveFinish], ['ex_bball_v_dribble', buildExBballVDribble],
];
export const EXERCISE_BATCH_C1_CLIPS: readonly string[] = EXERCISE_BATCH_C1_BUILDERS.map(([n]) => n);
