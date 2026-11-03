// The barbell clean and snatch families (DEMO-LOOPS-5, 2026-11-03): one parametric lift, read against the movement each entry
// was imported as (free-exercise-db): the start (the floor, below the knees, the hang at the hips), the pull (the second
// pull's triple extension and shrug), and how the bar is received — in the front rack (the clean) or locked out overhead
// on a wide grip (the snatch), at full depth, in a power (quarter) squat, or in a split; or not at all (the pull, the
// shrug). The clean and press and the clean and jerk carry on from the rack. Same kit and pipeline as the library's loops.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, both, bothDir, type ExKey, type Pair } from './exerciseKit';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
type Grip = 'clean' | 'snatch';
type Start = 'floor' | 'knee' | 'hang';
type Catch = 'full' | 'power' | 'split' | 'none' | 'shrug' | 'muscle';
type Then = 'press' | 'jerk' | null;

const FEET = both(0.15, ANKLE, 0.06);
const KNEES = bothDir(0.25, 0, 1);
/** both hands from the posed shoulders (Left +x is in toward the middle): the clean's grip just outside the legs, the
 *  snatch's wide */
const grip = (g: Grip, y: number, z: number): Pair => { const x = g === 'clean' ? 0.02 : -0.20; return { Left: [x, y, z], Right: [-x, y, z] }; };
const ELBOWS_OUT_BACK = bothDir(0.7, 0, -0.5);

/** the bar on the floor at the shins, the hips down, the back flat, the shoulders just in front of the bar */
const floor = (g: Grip): Pose => ({ bones: { Hips: [54, 0, 0], Spine: [2, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] }, feet: FEET, kneePoles: KNEES, hands: both(g === 'clean' ? 0.24 : 0.44, 0.27, 0.14), poles: ELBOWS_OUT_BACK, hipsY: -0.42 });
/** the bar just below the knees (the first pull's end, the hang below the knees) */
const knee = (g: Grip): Pose => ({ bones: { Hips: [42, 0, 0], Spine: [2, 0, 0], Neck: [-24, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet: FEET, kneePoles: KNEES, rel: grip(g, -0.58, 0.04), poles: ELBOWS_OUT_BACK, hipsY: -0.17 });
/** the hang: the bar at the hips, the knees soft, the torso inclined a little forward */
const hang = (g: Grip): Pose => ({ bones: { Hips: [20, 0, 0], Spine: [2, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-6, 0, 0] }, feet: FEET, kneePoles: KNEES, rel: grip(g, -0.57, 0.06), poles: ELBOWS_OUT_BACK, hipsY: -0.07 });
/** the second pull's peak: hips, knees and ankles extended, up on the toes, the shoulders shrugged to the ears */
const extend = (g: Grip): Pose => ({ bones: { Hips: [-6, 0, 0], Spine: [-2, 0, 0], Neck: [0, 0, 0], LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, feet: both(0.15, ANKLE + 0.07, 0.04), kneePoles: KNEES, rel: grip(g, -0.44, 0.10), poles: bothDir(0.8, 0.2, -0.4), hipsY: 0.07 });
/** the elbows high and out, the bar riding up close to the body, the feet coming off the floor to move */
const pullHigh = (g: Grip): Pose => ({ bones: { ...STAND, Hips: [0, 0, 0] }, feet: both(0.15, ANKLE + 0.03, 0.04), kneePoles: KNEES, rel: grip(g, g === 'clean' ? -0.12 : 0.04, 0.14), poles: bothDir(1, 0.6, 0), hipsY: 0.05 });

/** the receiving position: the bar racked on the front of the shoulders, elbows forward (the clean), or locked out overhead
 *  (the snatch); at full depth, in a quarter squat, or in a split */
function received(g: Grip, depth: 'full' | 'power' | 'split' | 'stand'): Pose {
  const rel: Pair = g === 'clean' ? { Left: [0.0, 0.05, 0.15], Right: [0.0, 0.05, 0.15] } : grip('snatch', 0.52, -0.04);
  const poles = g === 'clean' ? bothDir(0.2, -0.1, 1) : bothDir(1, 0.1, -0.2);
  if (depth === 'split') return { bones: { Hips: [4, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], RightFoot: [20, 0, 0] }, feet: { Left: [-0.15, ANKLE, 0.34], Right: [0.15, 0.13, -0.44] }, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -1, 0.4] }, rel, poles, hipsY: -0.22 };
  if (depth === 'stand') return { bones: { ...STAND, Spine: [0, 0, 0] }, feet: FEET, kneePoles: KNEES, rel, poles, hipsY: 0 };
  const deep = depth === 'full';
  return { bones: { Hips: [deep ? 20 : 14, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], LeftFoot: [deep ? -34 : -14, 0, 0], RightFoot: [deep ? -34 : -14, 0, 0] }, feet: both(0.19, ANKLE, 0.08), kneePoles: bothDir(0.35, 0, 1), rel, poles, hipsY: deep ? -0.42 : -0.15 };
}

function lift(name: string, g: Grip, start: Start, how: Catch, then: Then = null): Builder {
  const S = start === 'floor' ? floor(g) : start === 'knee' ? knee(g) : hang(g);
  const keys: ExKey[] = [at(S, 0, true)];
  let t = 0;
  const add = (p: Pose, dt: number, hold = false) => { t += dt; keys.push(at(p, t, hold)); };
  if (start === 'floor') add(knee(g), 0.55);
  if (start !== 'hang') add(hang(g), 0.3);
  if (how === 'shrug') {
    add({ ...hang(g), rel: grip(g, -0.49, 0.06), bones: { ...hang(g).bones, Neck: [-8, 0, 0] } }, 0.35, true);
    add(hang(g), 0.5, true);
    return (scene, sk) => run(scene, sk, name, t + 0.6, keys, true);
  }
  add(extend(g), 0.22, true);
  if (how === 'none') {
    add(extend(g), 0.25, true);
    if (start !== 'hang') add(knee(g), 0.8);
    return (scene, sk) => run(scene, sk, name, t + (start === 'floor' ? 0.9 : 0.8), keys, true);
  }
  add(pullHigh(g), 0.14);
  if (how === 'muscle') {
    add(received(g, 'stand'), 0.4, true);
  } else {
    add(received(g, how), 0.2, true);
    add(received(g, how), 0.35, true);
    add(received(g, 'stand'), how === 'full' ? 0.9 : 0.6, true);
  }
  add(received(g, 'stand'), 0.4, true);
  if (then === 'press') {
    add({ ...received('clean', 'stand'), rel: { Left: [0.0, 0.62, -0.02], Right: [0.0, 0.62, -0.02] }, poles: bothDir(1, 0.1, -0.1) }, 0.8, true);
    add({ ...received('clean', 'stand'), rel: { Left: [0.0, 0.62, -0.02], Right: [0.0, 0.62, -0.02] }, poles: bothDir(1, 0.1, -0.1) }, 0.3, true);
    add(received('clean', 'stand'), 0.8, true);
  } else if (then === 'jerk') {
    const over: Pair = { Left: [0.0, 0.60, -0.02], Right: [0.0, 0.60, -0.02] };
    add({ ...received('clean', 'stand'), bones: { Hips: [6, 0, 0], Spine: [0, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] }, hipsY: -0.09 }, 0.45, true);
    add({ ...received('clean', 'stand'), bones: { ...STAND, LeftFoot: [16, 0, 0], RightFoot: [16, 0, 0] }, rel: { Left: [0.0, 0.24, 0.06], Right: [0.0, 0.24, 0.06] }, poles: bothDir(0.8, -0.3, 0.2), hipsY: 0.03 }, 0.2);
    add({ ...received('clean', 'split'), rel: over, poles: bothDir(1, 0.1, -0.1) }, 0.22, true);
    add({ ...received('clean', 'split'), rel: over, poles: bothDir(1, 0.1, -0.1) }, 0.35, true);
    add({ ...received('clean', 'stand'), rel: over, poles: bothDir(1, 0.1, -0.1) }, 0.6, true);
    add(received('clean', 'stand'), 0.7, true);
  }
  // the bar back down to where it started
  add(hang(g), 0.8, true);
  if (start !== 'hang') add(knee(g), 0.5);
  return (scene, sk) => run(scene, sk, name, t + (start === 'floor' ? 0.7 : start === 'knee' ? 0.4 : 0.5), keys, true);
}

/** ex_bb_snatch_balance — the bar on the back of the shoulders, the snatch grip: a short dip and drive (the heave), then drop
 *  under it to the bottom of the overhead squat as the arms punch it to lockout; stand up; and the bar back down. */
const snatchBalance: Builder = (scene, sk) => {
  const back: Pair = { Left: [-0.22, 0.02, -0.10], Right: [0.22, 0.02, -0.10] };
  const top: Pose = { bones: { ...STAND, Hips: [2, 0, 0] }, feet: FEET, kneePoles: KNEES, rel: back, poles: bothDir(0.3, -1, -0.3), hipsY: 0 };
  const dip: Pose = { ...top, bones: { Hips: [8, 0, 0], Spine: [0, 0, 0], Neck: [-4, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hipsY: -0.09 };
  const pop: Pose = { ...top, bones: { ...STAND, LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, rel: { Left: [-0.21, 0.18, -0.08], Right: [0.21, 0.18, -0.08] }, poles: bothDir(1, 0.2, -0.3), hipsY: 0.03 };
  return run(scene, sk, 'ex_bb_snatch_balance', 4.0, [
    at(top, 0, true), at(dip, 0.4, true), at(pop, 0.58), at(received('snatch', 'full'), 0.95, true), at(received('snatch', 'full'), 1.4, true),
    at(received('snatch', 'stand'), 2.3, true), at(received('snatch', 'stand'), 2.7, true), at(top, 3.5, true),
  ], true);
};

export const OLY_BUILDERS: readonly [string, Builder][] = [
  ['ex_bb_clean', lift('ex_bb_clean', 'clean', 'floor', 'full')],
  ['ex_bb_power_clean', lift('ex_bb_power_clean', 'clean', 'floor', 'power')],
  ['ex_bb_hang_clean', lift('ex_bb_hang_clean', 'clean', 'hang', 'full')],
  ['ex_bb_hang_clean_low', lift('ex_bb_hang_clean_low', 'clean', 'knee', 'full')],
  ['ex_bb_split_clean', lift('ex_bb_split_clean', 'clean', 'floor', 'split')],
  ['ex_bb_clean_pull', lift('ex_bb_clean_pull', 'clean', 'floor', 'none')],
  ['ex_bb_clean_shrug', lift('ex_bb_clean_shrug', 'clean', 'hang', 'shrug')],
  ['ex_bb_clean_press', lift('ex_bb_clean_press', 'clean', 'floor', 'power', 'press')],
  ['ex_bb_clean_jerk', lift('ex_bb_clean_jerk', 'clean', 'floor', 'full', 'jerk')],
  ['ex_bb_snatch', lift('ex_bb_snatch', 'snatch', 'floor', 'full')],
  ['ex_bb_power_snatch', lift('ex_bb_power_snatch', 'snatch', 'floor', 'power')],
  ['ex_bb_hang_snatch', lift('ex_bb_hang_snatch', 'snatch', 'hang', 'full')],
  ['ex_bb_hang_snatch_low', lift('ex_bb_hang_snatch_low', 'snatch', 'knee', 'full')],
  ['ex_bb_split_snatch', lift('ex_bb_split_snatch', 'snatch', 'floor', 'split')],
  ['ex_bb_snatch_pull', lift('ex_bb_snatch_pull', 'snatch', 'floor', 'none')],
  ['ex_bb_snatch_shrug', lift('ex_bb_snatch_shrug', 'snatch', 'hang', 'shrug')],
  ['ex_bb_muscle_snatch', lift('ex_bb_muscle_snatch', 'snatch', 'floor', 'muscle')],
  ['ex_bb_snatch_balance', snatchBalance],
];
