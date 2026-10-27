// Exercise loops, BATCH B2 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the next ten non-hoops loops: ranks 32–34,
// 37–41, 43, 44). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// One representative loop per id (named in each doc comment). One-sided movements are authored on the RIGHT and mirrored
// in-loop (exerciseKit.alternate). The bench / seat / incline these sit on is the stage's existing DEMO_PROPS prop.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, both, bothDir, loop, rep, mix, alternate, seat, lie, incline,
  STANCE, KNEES_OUT, HANG, HANG_POLES, ELBOWS_OUT, STAND, RACK, OVERHEAD, SEAT_Y,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_pallof — the Pallof press: in a soft athletic stance, both hands at the sternum press straight out, hold (the band
 *  pulling sideways, the trunk not turning), and return (Pallof matrix, anti-rotation holds; the kneeling and split bases play
 *  the standing one). */
export function buildExPallof(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.17, ANKLE, 0.10);
  const base = { bones: { Hips: [8, 0, 0] as Deg3, Spine: [2, 0, 0] as Deg3, Neck: [-6, 0, 0] as Deg3 }, feet, kneePoles: bothDir(0.2, 0, 1), hipsY: -0.06 };
  const chest: K = { ...base, hands: both(0.05, 1.20 - 0.06, 0.22), poles: bothDir(0.5, -1, -0.2) };
  const out: K = { ...base, hands: both(0.04, 1.26 - 0.06, 0.62), poles: bothDir(0.4, -1, 0) };
  return rep(scene, sk, 'ex_pallof', chest, out, 0.7, 1.0, 0.8, 0.5);
}

/** ex_iso_capacity — the wall sit: ease down until the thighs are level, hold and breathe, stand (knee / hip / isometric
 *  capacity holds; Copenhagen, reverse Nordic, TKE and slant-board holds play this one). The wall is not drawn. */
export function buildExIsoCapacity(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.17, ANKLE, 0.40);
  const stand: K = { bones: { ...STAND, LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.84 - 0.14, 0.14), poles: HANG_POLES, hipsY: -0.14 };
  const sit = (b: number): K => ({ bones: { Hips: [0, 0, 0], Spine: [-2 - b, 0, 0], Neck: [2, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet, kneePoles: bothDir(0.15, 0.2, 1), hands: both(0.22, 0.98 - 0.40, 0.32), poles: HANG_POLES, hipsY: -0.40 + b * 0.004 });
  return loop(scene, sk, 'ex_iso_capacity', 6.4, [
    at(stand, 0, true), { ...mix(stand, sit(0), 0.5), t: 0.6 }, at(sit(0), 1.2, true), at(sit(1.5), 2.6, true), at(sit(0), 4.0, true), at(sit(1.5), 5.0, true), { ...mix(sit(0), stand, 0.5), t: 5.8 },
  ]);
}

/** ex_lunge_lateral — the lateral lunge: the right foot steps out wide, the hips sit back over it (right knee bent over the
 *  toes, left leg long), push back to standing; then the left (lateral lunge, side split squat, Cossack, goblet lateral). */
export function buildExLungeLateral(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = both(0.12, ANKLE, 0.04);
  const hands = (d: number): Pair => both(0.10, 1.10 - d, 0.30);
  const stand: K = { bones: STAND, feet: home, kneePoles: bothDir(0.1, 0, 1), hands: hands(0), poles: bothDir(0.6, -1, 0), hipsY: 0 };
  const air: K = { ...stand, bones: { ...STAND, RightUpLeg: [-16, 0, -14], RightFoot: [6, 0, 0] }, feet: { Left: home.Left, Right: [0.34, ANKLE + 0.10, 0.05] }, hipsY: -0.02 };
  const low: K = {
    bones: { Hips: [34, 0, -4], Spine: [6, 0, 0], Neck: [-20, 0, 0], RightFoot: [-20, 0, 0], LeftFoot: [-32, 0, 0] },
    feet: { Left: home.Left, Right: [0.56, ANKLE, 0.06] }, kneePoles: { Right: [0.3, 0, 1], Left: [0, 0, 1] },
    hands: { Left: [0.12, 0.98 - 0.38, 0.40], Right: [0.36, 0.98 - 0.38, 0.40] }, poles: bothDir(0.6, -1, 0), hipsY: -0.34,
  };
  const land: K = { ...mix(air, low, 0.4), feet: { Left: home.Left, Right: [0.56, ANKLE, 0.06] }, kneePoles: { Right: [0.2, 0, 1], Left: [0, 0, 1] } };
  return loop(scene, sk, 'ex_lunge_lateral', 4.8, alternate([
    at(stand, 0, true), at(air, 0.35), at(land, 0.6), at(mix(land, low, 0.5), 0.8), at(low, 1.0, true), at(low, 1.35, true),
    at(mix(low, land, 0.5), 1.6), at(land, 1.8), at({ ...air, feet: { Left: home.Left, Right: [0.34, ANKLE + 0.08, 0.05] } }, 2.0),
  ], 2.4));
}

/** ex_press_alt — the alternating dumbbell press: the right hand presses overhead while the left waits at the shoulder, down,
 *  then the left (alternating / see-saw / single-arm / Arnold and landmine presses play this). */
export function buildExPressAlt(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { ...STAND, Spine: [0, 0, 0] as Deg3 }, feet: STANCE, hipsY: 0 };
  const rackPole: V3 = [0.4, -1, 0.3], topPole: V3 = [1, 0.1, -0.1];
  const both0: K = { ...base, rel: RACK, poles: bothDir(...rackPole) };
  const upR: K = { ...base, bones: { ...base.bones, Spine1: [0, 0, -3] }, rel: { Left: RACK.Left, Right: OVERHEAD.Right }, poles: { Left: [-rackPole[0], rackPole[1], rackPole[2]], Right: topPole } };
  return loop(scene, sk, 'ex_press_alt', 3.2, alternate([at(both0, 0, true), at(mix(both0, upR, 0.5), 0.45), at(upR, 0.8, true), at(upR, 1.0, true), at(mix(upR, both0, 0.5), 1.3)], 1.6));
}

/** ex_machine_cardio — the stationary bike: seated, hands forward on the bars, the feet turning the pedals half a turn apart
 *  (bike / air bike / recumbent intervals; rower, elliptical, stair and rope entries play the same cycle). The bike is not
 *  drawn; the stage's 'seat' prop stands in. */
export function buildExMachineCardio(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const N = 8, D = 1.0, keys: ExKey[] = [];
  const pedal = (a: number, x: number): V3 => [x, 0.24 + 0.13 * Math.sin(a), 0.44 + 0.13 * Math.cos(a)];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    keys.push({
      ...seat({ bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Neck: [-22, 0, 0], RightFoot: [-10 + 18 * Math.sin(a), 0, 0], LeftFoot: [-10 - 18 * Math.sin(a), 0, 0] },
        hands: both(0.22, 1.40 + SEAT_Y - 0.24, 0.50), poles: bothDir(0.5, -1, -0.2) }),
      feet: { Right: pedal(a, 0.16), Left: pedal(a + Math.PI, -0.16) }, kneePoles: bothDir(0.1, 0.4, 1), t: (D * i) / N,
    });
  }
  return loop(scene, sk, 'ex_machine_cardio', D, keys);
}

/** ex_curl_incline — the incline dumbbell curl: lying back on the 45° bench, the arms hanging straight down behind the torso
 *  line, the elbows still: curl to the shoulders and lower (incline / hammer-incline / lying-supine curls). */
export const buildExCurlIncline = (scene: Scene, sk: Skeleton) => rep(scene, sk, 'ex_curl_incline',
  incline({ rel: { Left: [0.0, -0.52, -0.06], Right: [0.0, -0.52, -0.06] }, poles: bothDir(0.1, -1, -0.3) }),
  incline({ rel: { Left: [0.02, -0.08, 0.14], Right: [-0.02, -0.08, 0.14] }, poles: bothDir(0.1, -1, -0.3) }), 0.8, 0.2, 1.1, 0.3);

/** ex_pulldown — the lat pulldown: seated, thighs under the pad, the hands wide overhead pull the bar to the top of the chest,
 *  the elbows driving down and out, a slight lean back (wide / close / neutral / single-arm pulldowns). The machine is not
 *  drawn; the stage's 'seat' prop stands in. */
export const buildExPulldown = (scene: Scene, sk: Skeleton) => rep(scene, sk, 'ex_pulldown',
  seat({ bones: { Spine: [-4, 0, 0], Neck: [-6, 0, 0] }, rel: both(0.18, 0.54, 0.06), poles: bothDir(0.9, 0.2, -0.2) }),
  seat({ bones: { Spine: [-12, 0, 0], Neck: [-10, 0, 0] }, rel: both(0.12, -0.02, 0.16), poles: bothDir(0.7, -1, -0.2) }), 0.8, 0.3, 1.1, 0.3);

/** ex_pullup — the pull-up from a dead hang: the hands stay on the (not drawn) bar, the body rises until the chin clears it,
 *  and lowers (pull-ups, chin-ups, hangs and holds; muscle-ups and kipping are not shown). Off the floor the whole loop. */
export function buildExPullup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const bar = both(0.26, 2.18, 0.06);
  const legs = { LeftUpLeg: [-8, 0, 2] as Deg3, RightUpLeg: [-8, 0, -2] as Deg3, LeftLeg: [24, 0, 0] as Deg3, RightLeg: [24, 0, 0] as Deg3, LeftFoot: [24, 0, 0] as Deg3, RightFoot: [24, 0, 0] as Deg3 };
  const hang: K = { bones: { ...STAND, ...legs, Neck: [-4, 0, 0] }, hands: bar, poles: bothDir(0.9, -0.3, -0.1), hipsY: 0.36 };
  const top: K = { bones: { ...STAND, ...legs, Spine: [-6, 0, 0], Neck: [-12, 0, 0] }, hands: bar, poles: bothDir(0.7, -1, -0.2), hipsY: 0.68 };
  return rep(scene, sk, 'ex_pullup', hang, top, 0.9, 0.3, 1.1, 0.4);
}

/** ex_triceps_lying — the incline triceps extension: on the 45° bench, upper arms still and pointing up, the hands lower
 *  behind the head and press back (incline / decline / lying extensions, JM and Tate presses play it). */
export const buildExTricepsLying = (scene: Scene, sk: Skeleton) => rep(scene, sk, 'ex_triceps_lying',
  incline({ hands: both(0.13, 1.34, -0.28), poles: bothDir(0.35, 0.6, 0.6) }), incline({ hands: both(0.11, 1.12, -0.56), poles: bothDir(0.35, 1, 0.2) }), 0.9, 0.2, 0.9, 0.35);

/** ex_bench_variants — the close-grip bench press: on the flat bench, hands narrow, elbows tucked to the sides on the way down,
 *  press to straight arms (close-grip / board / pin / one-arm / decline benches play this). */
export const buildExBenchVariants = (scene: Scene, sk: Skeleton) => rep(scene, sk, 'ex_bench_variants',
  lie({ hands: both(0.14, 1.10, -0.42), poles: bothDir(0.4, -0.5, 0.4) }), lie({ hands: both(0.16, 0.72, -0.32), poles: bothDir(0.35, -0.6, 0.5) }), 1.0, 0.2, 0.9, 0.35);

/** Batch B2: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B2_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_pallof', buildExPallof], ['ex_iso_capacity', buildExIsoCapacity], ['ex_lunge_lateral', buildExLungeLateral], ['ex_press_alt', buildExPressAlt],
  ['ex_machine_cardio', buildExMachineCardio], ['ex_curl_incline', buildExCurlIncline], ['ex_pulldown', buildExPulldown], ['ex_pullup', buildExPullup],
  ['ex_triceps_lying', buildExTricepsLying], ['ex_bench_variants', buildExBenchVariants],
];
export const EXERCISE_BATCH_B2_CLIPS: readonly string[] = EXERCISE_BATCH_B2_BUILDERS.map(([n]) => n);
