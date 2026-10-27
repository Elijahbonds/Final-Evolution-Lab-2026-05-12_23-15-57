// Exercise loops, BATCH C2 (FITNESS-TPOSE loop plan 2026-10-26, tier 4: the rest of the ball-sport loops released for Fitness —
// ranks 35, 42, 48, 50, 65). Same authoring as exerciseBatchC1.ts: pose clips, targets in the FINAL frame, in place, no ball
// drawn (demo.ts isBallClip), so the hands and feet carry it. Wrists use C1's measured convention (`wr`: the right hand's euler,
// the left written in right-hand terms and mirrored): y bends the fingers toward the palm, x turns the palm about the fingers
// (x −90 on a forward arm: the palms face each other, the ball held between them). The way a loop travels is drawn on the floor
// in volt (demo.ts DEMO_ARROWS).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, both, bothDir, loop, mix, alternate, type ExKey, type Pair, type V3, type Deg3 } from './exerciseKit';
import { wr } from './exerciseBatchC1';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });
const HOLD_BALL = wr([-90, 0, 0], [-90, 0, 0]);
const FEET: Pair = both(0.17, ANKLE, 0.06);
const KNEES: Pair = bothDir(0.25, 0, 1);
const STANCE_BONES: Record<string, Deg3> = { Hips: [20, 0, 0], Spine: [4, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] };

/** ex_bball_closeout — the closeout: from a low help stance, sprint-chop in place (quick short steps, the feet barely leave the
 *  floor), rise into the contest with the right hand high on the shot and the left low to the side to take away the drive, then
 *  sink back into the stance (closeout series and the defensive closeout drills play it; the volt arrow is the run at the shooter). */
export function buildExBballCloseout(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const wide: Pair = both(0.21, ANKLE, 0.06);
  const lowHands = { Right: [0.34, 0.98, 0.26] as V3, Left: [-0.34, 0.98, 0.26] as V3 };
  const help: K = { bones: { Hips: [24, 0, 0], Spine: [4, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0], ...wr([0, -30, 0], [0, -30, 0]) }, feet: wide, kneePoles: bothDir(0.3, 0, 1), hands: lowHands, poles: bothDir(0.5, -0.8, -0.3), hipsY: -0.22 };
  const chop = (side: 'Left' | 'Right', u: number): K => {
    const f = { ...wide }; const h = wide[side]!; f[side] = [h[0], ANKLE + 0.05, h[2] + 0.02];
    const hy = 1.0 + u * 0.3;
    return { ...help, bones: { ...help.bones, Hips: [22 - 6 * u, 0, 0], [side + 'Foot']: [0, 0, 0] }, feet: f, hands: { Right: [0.30, hy + u * 0.2, 0.30], Left: [-0.32, hy - u * 0.1, 0.28] }, hipsY: -0.20 + 0.06 * u };
  };
  const contest: K = { bones: { Hips: [12, 0, 0], Spine: [-2, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0], ...wr([-120, 0, 0], [0, -30, 0]) }, feet: wide, kneePoles: bothDir(0.3, 0, 1), hands: { Right: [0.14, 2.06, 0.34], Left: [-0.44, 0.92, 0.24] }, poles: { Left: [-0.6, -0.7, -0.3], Right: [0.6, -0.2, -0.4] }, hipsY: -0.12 };
  return loop(scene, sk, 'ex_bball_closeout', 3.2, [
    at(help, 0, true), at(help, 0.35, true), at(chop('Right', 0.2), 0.5), at(mix(help, chop('Left', 0.4), 0.5), 0.62), at(chop('Left', 0.5), 0.74), at(mix(help, chop('Right', 0.7), 0.5), 0.86), at(chop('Right', 0.8), 0.98),
    at(mix(help, contest, 0.6), 1.12), at(contest, 1.3, true), at(contest, 1.75, true), at(mix(contest, help, 0.5), 2.1), at(help, 2.5, true),
  ]);
}

/** ex_bball_triple_threat — the triple-threat jab series: the ball in the right-hip pocket (both hands on it), the left foot the
 *  pivot, a hard right-foot jab at the defender and back, the rip-through low across the knees to the left hip and back, then a
 *  second jab (jab-and-go, jab crossover, rip-through, face-up post moves and pivot footwork play it; the volt arrow is the jab). */
export function buildExBballTripleThreat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = { Left: [-0.17, ANKLE, 0.04], Right: [0.17, ANKLE, 0.10] };
  const jabF: Pair = { Left: home.Left, Right: [0.24, ANKLE, 0.40] };
  const pocket = { Right: [0.32, 1.00, 0.18] as V3, Left: [0.12, 1.02, 0.24] as V3 };
  const poles: Pair = { Left: [-0.3, -0.8, -0.5], Right: [0.6, -0.6, -0.5] };
  const stance: K = { bones: { ...STANCE_BONES, Hips: [22, 6, 0], Spine: [4, -4, 0], ...HOLD_BALL }, feet: home, kneePoles: KNEES, hands: pocket, poles, hipsY: -0.16 };
  const lift: K = { ...stance, bones: { ...stance.bones, RightFoot: [0, 0, 0] }, feet: { Left: home.Left, Right: [0.20, ANKLE + 0.08, 0.24] }, hipsY: -0.15 };
  const jab: K = { bones: { Hips: [26, 4, 0], Spine: [6, -4, 0], Neck: [-20, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-14, 0, 0], ...HOLD_BALL }, feet: jabF, kneePoles: bothDir(0.25, 0, 1), hands: pocket, poles, hipsY: -0.22 };
  const rip: K = { bones: { Hips: [30, -6, 0], Spine: [8, 6, 0], Neck: [-22, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-18, 0, 0], ...HOLD_BALL }, feet: home, kneePoles: KNEES, hands: { Right: [0.04, 0.70, 0.42], Left: [-0.16, 0.72, 0.40] }, poles: { Left: [-0.5, -0.8, -0.2], Right: [0.3, -0.8, -0.4] }, hipsY: -0.24 };
  const ripL: K = { ...rip, bones: { ...rip.bones, Hips: [24, -12, 0], Spine: [4, 8, 0] }, hands: { Right: [-0.10, 0.98, 0.24], Left: [-0.30, 1.00, 0.16] }, poles: { Left: [-0.6, -0.6, -0.5], Right: [0.2, -0.8, -0.5] }, hipsY: -0.18 };
  return loop(scene, sk, 'ex_bball_triple_threat', 3.4, [
    at(stance, 0, true), at(stance, 0.3, true), at(lift, 0.48), at(jab, 0.64, true), at(jab, 0.8, true), at(lift, 0.98), at(stance, 1.14, true),
    at(rip, 1.42), at(ripL, 1.68, true), at(ripL, 1.85, true), at(rip, 2.08), at(stance, 2.34, true),
    at(lift, 2.5), at(jab, 2.66, true), at(lift, 2.94), at(stance, 3.12),
  ]);
}

/** ex_bball_pass — the two-hand chest pass, stepping into it: the ball at the chest (palms on its sides, elbows in), step and push
 *  both arms long, the thumbs turned down and the palms out at the finish, recoil and step back; then the other foot steps
 *  (chest, bounce, overhead, skip and wrap-around partner passes play it; the volt arrow is the pass). */
export function buildExBballPass(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = { Left: [-0.15, ANKLE, 0.04], Right: [0.15, ANKLE, 0.04] };
  const chestH = { Right: [0.12, 1.26, 0.28] as V3, Left: [-0.12, 1.26, 0.28] as V3 };
  const elbowsIn: Pair = bothDir(0.6, -0.8, -0.3);
  const ready: K = { bones: { Hips: [12, 0, 0], Spine: [2, 0, 0], Neck: [-8, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0], ...HOLD_BALL }, feet: home, kneePoles: bothDir(0.15, 0, 1), hands: chestH, poles: elbowsIn, hipsY: -0.08 };
  const lift: K = { ...ready, bones: { ...ready.bones, RightFoot: [0, 0, 0] }, feet: { Left: home.Left, Right: [0.15, ANKLE + 0.07, 0.18] }, hipsY: -0.07 };
  const step: K = { bones: { Hips: [18, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-12, 0, 0], ...HOLD_BALL }, feet: { Left: home.Left, Right: [0.15, ANKLE, 0.36] }, kneePoles: bothDir(0.15, 0, 1), hands: { Right: [0.12, 1.24, 0.40], Left: [-0.12, 1.24, 0.40] }, poles: elbowsIn, hipsY: -0.12 };
  // the finish: arms long, the hands turned over (thumbs down, palms out) — the pronated follow-through. Measured: on a forward
  // arm x −90 is palm down and x 0 palm out (the thumb rolled down); the contest hand, arm up, shows its palm to the shooter at x −120
  const finish: K = { ...step, bones: { ...step.bones, Hips: [22, 0, 0], ...wr([0, 0, 0], [0, 0, 0]) }, hands: { Right: [0.14, 1.26, 0.80], Left: [-0.14, 1.26, 0.80] }, poles: bothDir(0.8, -0.5, -0.2), hipsY: -0.13 };
  return loop(scene, sk, 'ex_bball_pass', 3.2, alternate([
    at(ready, 0, true), at(ready, 0.3, true), at(lift, 0.45), at(step, 0.6), at(finish, 0.78, true), at(finish, 0.98, true), at(mix(finish, step, 0.6), 1.16), at(lift, 1.34), at(ready, 1.48),
  ], 1.6));
}

/** ex_soccer_touches — ball-mastery toe taps: the sole of one foot taps the top of the ball in front, then the other, with a
 *  light bounce on the standing foot, the arms loose for balance (toe taps, sole rolls, inside-outside, push-pull and step-over
 *  ball mastery play it). */
export function buildExSoccerTouches(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = { Left: [-0.13, ANKLE, 0.02], Right: [0.13, ANKLE, 0.02] };
  const arms = { Right: [0.30, 0.98, 0.14] as V3, Left: [-0.30, 0.98, 0.14] as V3 };
  const base: Record<string, Deg3> = { Hips: [10, 0, 0], Spine: [4, 0, 0], Neck: [-22, 0, 0], ...wr([0, 0, 0], [0, 0, 0]) };
  const both0: K = { bones: { ...base, LeftFoot: [-6, 0, 0], RightFoot: [-6, 0, 0] }, feet: home, kneePoles: bothDir(0.1, 0, 1), hands: arms, poles: bothDir(0.6, -0.8, -0.3), hipsY: -0.06 };
  const tap: K = { bones: { ...base, LeftFoot: [-8, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: home.Left, Right: [0.05, ANKLE + 0.17, 0.22] }, kneePoles: bothDir(0.1, 0, 1), hands: { Right: [0.26, 1.00, 0.20], Left: [-0.32, 1.00, 0.08] }, poles: bothDir(0.6, -0.8, -0.3), hipsY: -0.05 };
  return loop(scene, sk, 'ex_soccer_touches', 0.8, alternate([at(both0, 0), at(tap, 0.17), at(tap, 0.23)], 0.4));
}

/** ex_volleyball — the forearm pass: a wide low ready stance with the arms loose, the hands join into the platform (arms long,
 *  elbows locked, the thumbs side by side), the legs lift the platform up and through toward the target, and back to ready
 *  (forearm passing, digs, serve-receive and free-ball passing play it; sets, serves and blocks are this same low stance
 *  and footwork with the arms shown low; the volt arrow is the pass to the target). */
export function buildExVolleyball(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const wide: Pair = { Left: [-0.24, ANKLE, 0.02], Right: [0.24, ANKLE, 0.12] };
  const ready: K = { bones: { Hips: [26, 0, 0], Spine: [6, 0, 0], Neck: [-22, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0], ...wr([0, -20, 0], [0, -20, 0]) }, feet: wide, kneePoles: bothDir(0.35, 0, 1), hands: { Right: [0.30, 0.86, 0.36], Left: [-0.30, 0.86, 0.34] }, poles: bothDir(0.6, -0.8, -0.2), hipsY: -0.26 };
  const plat: K = { ...ready, bones: { ...ready.bones, Hips: [28, 0, 0], ...wr([-90, -20, 0], [-90, -20, 0]) }, hands: { Right: [0.03, 0.72, 0.52], Left: [-0.03, 0.72, 0.52] }, poles: bothDir(0.5, -0.4, -0.8), hipsY: -0.30 };
  const lift: K = { ...plat, bones: { ...plat.bones, Hips: [14, 0, 0], Spine: [2, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-12, 0, 0], RightFoot: [-12, 0, 0] }, hands: { Right: [0.03, 1.00, 0.56], Left: [-0.03, 1.00, 0.56] }, poles: bothDir(0.5, -0.5, -0.7), hipsY: -0.14 };
  return loop(scene, sk, 'ex_volleyball', 2.8, [
    at(ready, 0, true), at(ready, 0.45, true), at(plat, 0.8, true), at(plat, 1.0, true), at(lift, 1.3, true), at(lift, 1.55, true), at(mix(lift, ready, 0.5), 1.95), at(ready, 2.35, true),
  ]);
}

/** Batch C2: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_C2_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_bball_closeout', buildExBballCloseout], ['ex_bball_triple_threat', buildExBballTripleThreat], ['ex_bball_pass', buildExBballPass],
  ['ex_soccer_touches', buildExSoccerTouches], ['ex_volleyball', buildExVolleyball],
];
export const EXERCISE_BATCH_C2_CLIPS: readonly string[] = EXERCISE_BATCH_C2_BUILDERS.map(([n]) => n);
