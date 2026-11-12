// The grip family's wrist curls (DEMO-LOOPS-6, 2026-11-03), read against the movement each entry was imported as
// (free-exercise-db): the forearms rest on the thighs (sitting on a bench) or across a bench (kneeling in front of it), the
// hands hanging past the end, and only the wrists move — curling the weight up toward the forearm and lowering it as far as
// it goes; palms up (the wrist curl) or palms down (the reverse). Standing, the bar held behind the seat. The wrist bends
// about the hand bone's z (the kit's barbell grip turns the same axis: exercise.ts ex_squat_bar). Same kit and pipeline.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, SEATED, SEAT_Y, both, bothDir, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { kneel } from './exerciseMore';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
type Where = 'seat' | 'bench' | 'behind';

/** the wrists: `flex` degrees curled toward the palm (− lets the weight roll down); palms up or down; one hand or both */
const wrists = (flex: number, up: boolean, one: boolean): Record<string, Deg3> => {
  const r: Deg3 = [0, 0, up ? -flex : flex];
  return one ? { RightHand: r } : { LeftHand: [0, 0, -r[2]], RightHand: r };
};

function pose(where: Where, flex: number, up: boolean, one: boolean): Pose {
  const w = wrists(flex, up, one);
  const poles = up ? bothDir(0.4, -1, -0.2) : bothDir(0.6, -0.6, -0.4);
  if (where === 'seat') {
    // leaning forward, the forearms along the thighs, the wrists just past the knees
    const hands: Pair = one ? { Right: [0.16, 0.58 , 0.56], Left: [-0.18, 0.60, 0.40] } : both(0.15, 0.58, 0.56);
    return { ...SEATED, bones: { ...SEATED.bones, Hips: [34, 0, 0], Spine: [10, 0, 0], Neck: [-20, 0, 0], ...w }, hands, poles, hipsY: SEAT_Y };
  }
  if (where === 'bench') {
    // kneeling square to a bench, leaning over it, the forearms across its top, the hands over the far edge
    const p: Pose = { bones: { Hips: [42, 0, 0], Spine: [12, 0, 0], Neck: [-24, 0, 0], ...w }, hands: both(0.14, 0.50, 0.78), poles, hipsY: 0 };
    return kneel(p, ['Left', 'Right']);
  }
  // standing tall, the bar held behind the seat at arm's length, palms facing back
  return { bones: { ...STAND, ...w }, feet: both(0.14, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.08, -0.56, -0.14], Right: [-0.08, -0.56, -0.14] }, poles: bothDir(0.4, -0.2, -1), hipsY: 0 };
}

/** a rep: lowered (the weight rolled down) → curled up, a beat → lowered */
function wristCurl(name: string, where: Where, up: boolean, one = false): Builder {
  return (scene, sk) => run(scene, sk, name, 2.4, [at(pose(where, -36, up, one), 0, true), at(pose(where, 44, up, one), 0.9, true), at(pose(where, 44, up, one), 1.2, true), at(pose(where, -36, up, one), 2.1, true)], true);
}

/** ex_wrist_roller — standing, the arms straight out in front at shoulder height, both hands on the roller: the wrists take
 *  turns rolling it, one curls as the other extends. */
const wristRoller: Builder = (scene, sk) => {
  const p = (s: number): Pose => ({ bones: { ...STAND, LeftHand: [0, 0, 34 * s], RightHand: [0, 0, 34 * s] }, feet: both(0.14, ANKLE, 0.06), rel: { Left: [0.12, -0.02, 0.56], Right: [-0.12, -0.02, 0.56] }, poles: bothDir(0.6, -1, 0), hipsY: 0 });
  return run(scene, sk, 'ex_wrist_roller', 2.0, [at(p(1), 0, true), at(p(-1), 0.5, true), at(p(1), 1.0, true), at(p(-1), 1.5, true)], true);
};

export const GRIP_BUILDERS: readonly [string, Builder][] = [
  ['ex_wrist_curl', wristCurl('ex_wrist_curl', 'seat', true)], ['ex_wrist_curl_down', wristCurl('ex_wrist_curl_down', 'seat', false)],
  ['ex_wrist_curl_one', wristCurl('ex_wrist_curl_one', 'seat', true, true)], ['ex_wrist_curl_one_down', wristCurl('ex_wrist_curl_one_down', 'seat', false, true)],
  ['ex_wrist_curl_bench', wristCurl('ex_wrist_curl_bench', 'bench', true)], ['ex_wrist_curl_bench_down', wristCurl('ex_wrist_curl_bench_down', 'bench', false)],
  ['ex_wrist_curl_behind', wristCurl('ex_wrist_curl_behind', 'behind', true)], ['ex_wrist_roller', wristRoller],
];
