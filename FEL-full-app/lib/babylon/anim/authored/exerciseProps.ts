// Exercise loops on the gym's furniture (LIBRARY-ANATOMY-2, 2026-10-25): step-ups and step-downs on a box, sitting to a box
// on one leg, the rear-foot-elevated split squat, leg curls and extensions, the seated calf raise, hip thrusts and bridge
// variations, the Nordic curl, pull-ups and pulldowns, inverted rows, dips, push-ups with the hands or feet up, and the
// curls and rows done on an incline, a prone pad or a preacher pad.
//
// Owner decision (2026-10-25): raise coverage only with correct, authored loops. A loop that stands, sits, lies or hangs on
// something gets that thing drawn under it (lib/library/demo.ts PROP_SHAPES, by exerciseProps.data.ts PROPPED_LOOPS), so
// a step-up steps onto a box and a pull-up hangs from a bar. Positions here are written against those props' sizes.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, HIGH_PLANK, SEATED, SEAT_Y, INCLINE_Y, INCLINED, both, bothDir, loop, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { oneArm, sides } from './exerciseMore';
import { run, at } from './exerciseBody';
import { PRONE } from './exerciseFloor';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const sx = (s: Side, x: number) => (s === 'Left' ? -x : x);
const BOX_TOP = 0.40, BENCH_TOP = 0.44;
/** Arms hanging long at the sides, from the shoulders (so they ride the body up onto a box). */
const HANG_REL: Pair = both(0.06, -0.52, 0.04);
const HANG_POLES = bothDir(0.2, -0.3, -0.9);
/** Arms long in front at shoulder height (balance on one leg). */
const ARMS_FWD: Pair = { Left: [0.06, -0.06, 0.50], Right: [-0.06, -0.06, 0.50] };
const CHEST: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] };

// ── on a box ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** ex_step_up — the right foot onto the box in front, drive up to stand on it, the left foot joins; step down left, then right.
 *  `drive`: the left knee drives up at the top instead of joining (step-up with knee drive). */
function stepUp(scene: Scene, sk: Skeleton, name: string, drive: boolean): AnimationGroup | null {
  const on = BOX_TOP + ANKLE;
  const home: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, -0.04), kneePoles: bothDir(0.1, 0, 1), rel: HANG_REL, poles: HANG_POLES, hipsY: 0 };
  const foot: Pose = { ...home, bones: { ...STAND, Hips: [10, 0, 0] }, feet: { Left: [-0.13, ANKLE, -0.04], Right: [0.13, on, 0.40] }, hipsY: -0.02, hipsZ: 0.02 };
  const mid: Pose = { ...home, bones: { ...STAND, Hips: [14, 0, 0] }, feet: { Left: [-0.13, ANKLE + 0.12, 0.10], Right: [0.13, on, 0.40] }, hipsY: 0.20, hipsZ: 0.22 };
  const top: Pose = drive
    ? { ...home, bones: { ...STAND, LeftUpLeg: [-84, 0, 0], LeftLeg: [94, 0, 0], LeftFoot: [10, 0, 0] }, feet: { Right: [0.10, on, 0.40] }, hipsY: BOX_TOP, hipsZ: 0.38 }
    : { ...home, feet: { Left: [-0.13, on, 0.38], Right: [0.13, on, 0.40] }, hipsY: BOX_TOP, hipsZ: 0.38 };
  const down1: Pose = { ...home, bones: { ...STAND, Hips: [8, 0, 0] }, feet: { Left: [-0.13, ANKLE, -0.04], Right: [0.13, on, 0.40] }, hipsY: -0.02, hipsZ: 0.04 };
  return run(scene, sk, name, 3.2, [at(home, 0, true), at(foot, 0.5, true), at(mid, 0.9), at(top, 1.3, true), at(top, 1.65, true), at(down1, 2.3, true)], true);
}

/** ex_step_up_lat — the box to the right: the right foot onto it sideways, drive up, the left foot joins; and back down. */
function stepUpLateral(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const on = BOX_TOP + ANKLE;
  const home: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, 0.04), kneePoles: bothDir(0.1, 0, 1), rel: HANG_REL, poles: HANG_POLES, hipsY: 0 };
  const foot: Pose = { ...home, bones: { ...STAND, Hips: [8, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.04], Right: [0.40, on, 0.04] }, kneePoles: { Left: [0, 0, 1], Right: [0.3, 0, 1] }, hipsY: -0.04, hipsX: 0.04 };
  const top: Pose = { ...home, feet: { Left: [0.22, on, 0.04], Right: [0.50, on, 0.04] }, hipsY: BOX_TOP, hipsX: 0.36 };
  return run(scene, sk, 'ex_step_up_lat', 3.0, [at(home, 0, true), at(foot, 0.5, true), at(top, 1.2, true), at(top, 1.5, true), at(foot, 2.3, true)], true);
}

/** ex_step_down / ex_step_down_lat — standing on the box on the left leg, the right heel lowers to touch the floor in front
 *  (or beside the box) and the left leg drives back up. */
function stepDown(scene: Scene, sk: Skeleton, name: string, lateral: boolean): AnimationGroup | null {
  const on = BOX_TOP + ANKLE;
  const top: Pose = { bones: { ...STAND, RightUpLeg: [lateral ? 0 : -14, 0, lateral ? -12 : 0], RightLeg: [8, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.08, on, 0.0] }, kneePoles: { Left: [0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: BOX_TOP };
  const low: Pose = { bones: { Hips: [22, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-24, 0, 0] }, feet: { Left: [-0.08, on, 0.0], Right: lateral ? [0.42, ANKLE, 0.02] : [0.10, ANKLE, 0.34] }, kneePoles: { Left: [0, 0, 1], Right: [lateral ? 0.4 : 0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: BOX_TOP - 0.26, hipsZ: -0.04 };
  return run(scene, sk, name, 2.4, [at(top, 0, true), at(low, 0.9, true), at(low, 1.1, true)], true);
}

/** ex_sl_box_squat — on the left leg in front of a box, the right leg forward off the floor: sit back to the box, stand. */
function slBoxSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top: Pose = { bones: { ...STAND, RightUpLeg: [-36, 0, 0], RightLeg: [14, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: 0 };
  const low: Pose = { bones: { Hips: [30, 0, 0], Spine: [10, 0, 0], Neck: [-16, 0, 0], RightUpLeg: [-92, 0, 0], RightLeg: [8, 0, 0], RightFoot: [-10, 0, 0], LeftFoot: [-30, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: -0.38, hipsZ: -0.24 };
  return run(scene, sk, 'ex_sl_box_squat', 2.8, [at(top, 0, true), at(low, 1.1, true), at(low, 1.4, true)], true);
}

/** ex_pistol / ex_pistol_goblet — the full single-leg squat, the free leg held long in front off the floor. */
function pistol(scene: Scene, sk: Skeleton, name: string, hands: Pair): AnimationGroup | null {
  const top: Pose = { bones: { ...STAND, RightUpLeg: [-44, 0, 0], RightLeg: [10, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: hands, poles: bothDir(0.3, -1, 0), hipsY: 0 };
  const low: Pose = { bones: { Hips: [36, 0, 0], Spine: [14, 0, 0], Neck: [-20, 0, 0], RightUpLeg: [-128, 0, 0], RightLeg: [4, 0, 0], RightFoot: [-10, 0, 0], LeftFoot: [-48, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: hands, poles: bothDir(0.3, -1, 0), hipsY: -0.62, hipsZ: -0.08 };
  return run(scene, sk, name, 3.0, [at(top, 0, true), at(low, 1.2, true), at(low, 1.5, true)], true);
}

/** ex_skater_squat — the single-leg squat with the free leg bent behind, its knee lowering toward the floor. */
function skaterSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top: Pose = { bones: { ...STAND, RightUpLeg: [10, 0, 0], RightLeg: [80, 0, 0], RightFoot: [20, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: 0 };
  const low: Pose = { bones: { Hips: [30, 0, 0], Spine: [10, 0, 0], Neck: [-16, 0, 0], RightUpLeg: [-14, 0, 0], RightLeg: [100, 0, 0], RightFoot: [30, 0, 0], LeftFoot: [-30, 0, 0] }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: ARMS_FWD, poles: bothDir(0.3, -1, 0), hipsY: -0.42, hipsZ: -0.04 };
  return run(scene, sk, 'ex_skater_squat', 2.8, [at(top, 0, true), at(low, 1.1, true), at(low, 1.4, true)], true);
}

/** ex_bulgarian — the rear-foot-elevated split squat: the back foot's laces on a bench behind, straight down and up. */
function bulgarian(scene: Scene, sk: Skeleton, name: string, bar: boolean): AnimationGroup | null {
  const feet: Pair = { Left: [-0.12, ANKLE, 0.30], Right: [0.12, BENCH_TOP + 0.07, -0.60] };
  const arms = bar ? { rel: { Left: [-0.24, 0.02, -0.10] as V3, Right: [0.24, 0.02, -0.10] as V3 }, poles: bothDir(0.3, -1, -0.3) } : { rel: HANG_REL, poles: HANG_POLES };
  const grip: Record<string, Deg3> = bar ? { LeftHand: [0, 0, -85], RightHand: [0, 0, -85] } : {};
  const top: Pose = { bones: { ...STAND, ...grip, RightFoot: [70, 0, 0] }, feet, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] }, ...arms, hipsY: -0.08 };
  const low: Pose = { bones: { ...STAND, ...grip, Spine: [6, 0, 0], RightFoot: [70, 0, 0], LeftFoot: [-16, 0, 0] }, feet, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] }, ...arms, hipsY: -0.42, hipsZ: -0.02 };
  return run(scene, sk, name, 2.6, [at(top, 0, true), at(low, 1.0, true), at(low, 1.25, true)], true);
}

// ── leg machines and benches ─────────────────────────────────────────────────────────────────────────────────────────
/** ex_lying_leg_curl — face down on a bench, the knees just off its end: the heels curl up toward the glutes and lower. */
function lyingLegCurl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Pose = { bones: { Hips: [90, 0, 0], Spine: [-4, 0, 0], Neck: [-24, 0, 0], LeftUpLeg: [0, 0, 3], RightUpLeg: [0, 0, -3], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hands: both(0.20, 0.42, 0.58), poles: bothDir(0.6, -0.2, -0.6), hipsY: -0.40 };
  const curl = (k: number): Pose => ({ ...base, bones: { ...base.bones, LeftLeg: [k, 0, 0], RightLeg: [k, 0, 0] } });
  return run(scene, sk, 'ex_lying_leg_curl', 2.4, [at(curl(4), 0, true), at(curl(112), 0.9, true), at(curl(112), 1.2, true)], true);
}
const SEAT_LEGS = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 8], RightUpLeg: [thigh, 0, -8], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
const SEAT_BASE: Pose = { bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, hands: both(0.22, BENCH_TOP + 0.04, 0.02), poles: bothDir(0.6, -0.4, -0.6), hipsY: SEAT_Y };
/** ex_seated_leg_curl / ex_leg_extension(_one) — seated on the bench: the legs from long in front curl down under the seat; or
 *  from bent extend out straight (one leg, the other resting). */
function seatedKnee(scene: Scene, sk: Skeleton, name: string, from: number, to: number, oneLeg: boolean): AnimationGroup | null {
  const at2 = (k: number): Pose => ({ ...SEAT_BASE, bones: { ...SEAT_BASE.bones, ...SEAT_LEGS(-88, oneLeg ? 92 : k), ...(oneLeg ? { RightLeg: [k, 0, 0] as Deg3 } : {}) } });
  return run(scene, sk, name, 2.4, [at(at2(from), 0, true), at(at2(to), 0.9, true), at(at2(to), 1.2, true)], true);
}
/** ex_seated_calf — seated, the knees bent at right angles: the heels rise and lower, the hands on the knees. */
function seatedCalf(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down: Pose = { ...SEATED, bones: { ...SEATED.bones }, hands: both(0.20, 0.56, 0.40), poles: bothDir(0.6, -0.4, -0.4), hipsY: SEAT_Y };
  const up: Pose = { ...down, bones: { ...down.bones, LeftFoot: [32, 0, 0], RightFoot: [32, 0, 0] }, feet: both(0.19, ANKLE + 0.08, 0.48), hands: both(0.20, 0.62, 0.40) };
  return run(scene, sk, 'ex_seated_calf', 1.8, [at(down, 0, true), at(up, 0.6, true), at(up, 0.9, true)], true);
}
/** ex_standing_leg_curl — standing on the left, the hands on the hips: the right heel curls up toward the glute and lowers. */
function standingLegCurl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hips: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
  const p = (k: number): Pose => ({ bones: { ...STAND, RightUpLeg: [6, 0, 0], RightLeg: [k, 0, 0], RightFoot: [k > 60 ? 30 : 0, 0, 0] }, feet: { Left: [-0.09, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: hips, poles: bothDir(1, -0.2, 0), hipsY: 0 });
  return run(scene, sk, 'ex_standing_leg_curl', 2.2, [at(p(6), 0, true), at(p(118), 0.8, true), at(p(118), 1.1, true)], true);
}

// ── hip thrusts and bridges ───────────────────────────────────────────────────────────────────────────────────────────
/** ex_hip_thrust (/ _sl) — the upper back on a bench behind, feet flat: the hips drop and drive up to one line with the
 *  shoulders, the hands on the bar over the hips (one leg: the other knee held up). */
function hipThrust(scene: Scene, sk: Skeleton, name: string, oneLeg: boolean): AnimationGroup | null {
  const free: Record<string, Deg3> = oneLeg ? { RightUpLeg: [-62, 0, 0], RightLeg: [92, 0, 0] } : {};
  const feet: Pair = oneLeg ? { Left: [-0.14, ANKLE, 0.42] } : both(0.18, ANKLE, 0.42);
  const up: Pose = { bones: { Hips: [-92, 0, 0], Spine: [0, 0, 0], Neck: [26, 0, 0], ...free }, feet, kneePoles: bothDir(0.1, 1, 0.3), hands: both(0.26, 0.58, 0.02), poles: bothDir(0.8, 0.4, 0), hipsY: -0.45 };
  const down: Pose = { bones: { Hips: [-58, 0, 0], Spine: [0, 0, 0], Neck: [30, 0, 0], ...free }, feet, kneePoles: bothDir(0.1, 1, 0.3), hands: both(0.26, 0.32, -0.02), poles: bothDir(0.8, 0.4, 0), hipsY: -0.70, hipsZ: -0.04 };
  return run(scene, sk, name, 2.4, [at(down, 0, true), at(up, 0.8, true), at(up, 1.2, true)], true);
}
/** The bridge's floor and top (exercise.ts ex_bridge). */
const BRIDGE_DOWN: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0] }, feet: both(0.14, ANKLE, 0.50), kneePoles: bothDir(0.1, 1, 0.2), hands: both(0.30, 0.04, -0.20), poles: bothDir(0.6, 0.3, 0), hipsY: -0.82 };
const BRIDGE_UP: Pose = { bones: { Hips: [-118, 0, 0], Spine: [0, 0, 0], Neck: [34, 0, 0] }, feet: both(0.14, ANKLE, 0.50), kneePoles: bothDir(0.1, 1, 0.4), hands: both(0.30, 0.04, -0.34), poles: bothDir(0.6, 0.3, 0), hipsY: -0.60 };
/** ex_bridge_march — holding the bridge, one foot lifts (knee up to a right angle) and sets down, then the other. */
function bridgeMarch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const lift = (s: Side): Pose => ({ ...BRIDGE_UP, feet: { [s === 'Left' ? 'Right' : 'Left']: BRIDGE_UP.feet![s === 'Left' ? 'Right' : 'Left'], [s]: [sx(s, 0.14), 0.40, 0.34] } as Pair, kneePoles: bothDir(0.1, 1, 0.6) });
  return run(scene, sk, 'ex_bridge_march', 3.2, [at(BRIDGE_UP, 0, true), at(lift('Left'), 0.8, true), at(BRIDGE_UP, 1.6, true), at(lift('Right'), 2.4, true)], true);
}
/** ex_bridge_sl — the single-leg glute bridge: the right leg long and lifted, the left foot drives the hips up. */
function bridgeSl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down: Pose = { ...BRIDGE_DOWN, feet: { Left: [-0.14, ANKLE, 0.50], Right: [0.14, 0.42, 0.86] }, kneePoles: bothDir(0.1, 1, 0.2) };
  const up: Pose = { ...BRIDGE_UP, feet: { Left: [-0.14, ANKLE, 0.50], Right: [0.14, 0.62, 0.90] }, kneePoles: bothDir(0.1, 1, 0.4) };
  return run(scene, sk, 'ex_bridge_sl', 2.4, [at(down, 0, true), at(up, 0.8, true), at(up, 1.2, true)], true);
}
/** ex_bridge_feetup — the bridge with the feet on a bench in front. */
function bridgeFeetUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, BENCH_TOP + 0.08, 0.62);
  const down: Pose = { ...BRIDGE_DOWN, feet, kneePoles: bothDir(0.1, 1, 0.4) };
  const up: Pose = { ...BRIDGE_UP, bones: { ...BRIDGE_UP.bones, Hips: [-108, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.4), hipsY: -0.50 };
  return run(scene, sk, 'ex_bridge_feetup', 2.4, [at(down, 0, true), at(up, 0.8, true), at(up, 1.2, true)], true);
}
/** ex_slider_curl — the hips held up in a bridge, the heels slide out until the legs are nearly long and pull back in. */
function sliderCurl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const out: Pose = { ...BRIDGE_UP, bones: { ...BRIDGE_UP.bones, Hips: [-100, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] }, feet: both(0.14, ANKLE + 0.01, 0.94), kneePoles: bothDir(0.1, 1, 0.2), hipsY: -0.70 };
  return run(scene, sk, 'ex_slider_curl', 2.6, [at(BRIDGE_UP, 0, true), at(out, 1.1, true), at(out, 1.3, true)], true);
}
/** ex_nordic — tall-kneeling, the ankles held: the body leans forward from the knees in one line, slowly, the hands catch the
 *  floor at the bottom and push back up. */
function nordic(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const lean = (deg: number, hands: Pair, poles: Pair): Pose => {
    const r = (deg * Math.PI) / 180;
    return { bones: { Hips: [deg, 0, 0], Spine: [0, 0, 0], Neck: [-deg * 0.4, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, feet: both(0.12, 0.09, -0.42), kneePoles: bothDir(0, -1, 0.1), hands, poles, hipsY: 0.06 + 0.42 * Math.cos(r) - 0.91, hipsZ: 0.42 * Math.sin(r) };
  };
  const up = lean(0, both(0.10, 0.92, 0.18), bothDir(1, -0.3, 0));
  return run(scene, sk, 'ex_nordic', 3.6, [at(up, 0, true), at(lean(30, both(0.12, 0.70, 0.42), bothDir(1, -0.3, 0)), 1.0), at(lean(58, both(0.24, 0.05, 0.86), bothDir(0.6, 0, -0.8)), 2.0, true), at(lean(40, both(0.24, 0.05, 0.86), bothDir(0.6, 0, -0.8)), 2.6)], true);
}

// ── bars ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BAR_Y = 2.20;
/** ex_pullup / ex_chinup / ex_dead_hang / ex_scap_pullup — hanging from the bar overhead: pull the chin over it and lower;
 *  the chin-up with the hands closer and the elbows forward; the hang held; the shoulders set down and up on long arms. */
function hang(scene: Scene, sk: Skeleton, name: string, kind: 'pull' | 'chin' | 'hang' | 'scap'): AnimationGroup | null {
  const w = kind === 'chin' ? 0.16 : 0.26;
  const legs = { LeftUpLeg: [-10, 0, 2] as Deg3, RightUpLeg: [-10, 0, -2] as Deg3, LeftLeg: [22, 0, 0] as Deg3, RightLeg: [22, 0, 0] as Deg3, LeftFoot: [20, 0, 0] as Deg3, RightFoot: [20, 0, 0] as Deg3 };
  const poles = kind === 'chin' ? bothDir(0.3, -0.5, 0.8) : bothDir(1, -0.4, 0);
  const p = (hy: number, bones: Record<string, Deg3> = {}): Pose => ({ bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], ...legs, ...bones }, handsAt: both(w, BAR_Y - 0.02, 0.02), poles, hipsY: hy });
  if (kind === 'hang') return loop(scene, sk, name, 3.0, [at(p(0.26), 0, true), at(p(0.26, { Spine1: [-2, 0, 0] }), 1.5, true)]);
  if (kind === 'scap') return run(scene, sk, name, 2.0, [at(p(0.25), 0, true), at(p(0.33, { Spine: [-4, 0, 0] }), 0.7, true), at(p(0.33, { Spine: [-4, 0, 0] }), 1.0, true)]);
  return run(scene, sk, name, 2.6, [at(p(0.26), 0, true), at(p(0.62, { Spine: [-6, 0, 0], Neck: [-10, 0, 0] }), 0.9, true), at(p(0.62, { Spine: [-6, 0, 0], Neck: [-10, 0, 0] }), 1.2, true)]);
}

/** The lat pulldown, seated: the hands from overhead (wide, or close) down to the top of the chest, elbows down and back. */
const PULLDOWN = {
  a: { ...SEATED, bones: { ...SEATED.bones, Hips: [-6, 0, 0] as Deg3 }, rel: { Left: [-0.16, 0.50, 0.04] as V3, Right: [0.16, 0.50, 0.04] as V3 }, poles: bothDir(1, -0.2, 0), hipsY: SEAT_Y },
  b: { ...SEATED, bones: { ...SEATED.bones, Hips: [-10, 0, 0] as Deg3 }, rel: { Left: [-0.06, 0.0, 0.10] as V3, Right: [0.06, 0.0, 0.10] as V3 }, poles: bothDir(0.8, -1, -0.3), hipsY: SEAT_Y },
  t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number],
};
const PULLDOWN_CLOSE = { ...PULLDOWN, a: { ...PULLDOWN.a, rel: { Left: [0.04, 0.50, 0.06] as V3, Right: [-0.04, 0.50, 0.06] as V3 } }, b: { ...PULLDOWN.b, rel: { Left: [0.06, -0.04, 0.16] as V3, Right: [-0.06, -0.04, 0.16] as V3 }, poles: bothDir(0.3, -1, -0.5) } };
function rep2(scene: Scene, sk: Skeleton, name: string, p: { a: Pose; b: Pose; t: [number, number, number, number] }, pivot = true): AnimationGroup | null {
  const [down, hold, up, rest] = p.t;
  return run(scene, sk, name, down + hold + up + rest, [at(p.a, 0, true), at(p.b, down, true), at(p.b, down + hold, true), at(p.a, down + hold + up, true)], pivot);
}
/** ex_straight_arm_pulldown — standing, hinged a little: the straight arms sweep from overhead in front down to the thighs. */
const STRAIGHT_PULLDOWN = {
  a: { bones: { ...STAND, Hips: [18, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3 }, feet: both(0.14, ANKLE, 0.10), kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.08, 0.30, 0.42] as V3, Right: [-0.08, 0.30, 0.42] as V3 }, poles: bothDir(0.4, 1, 0), hipsY: -0.04 },
  b: { bones: { ...STAND, Hips: [18, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3 }, feet: both(0.14, ANKLE, 0.10), kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.08, -0.46, 0.16] as V3, Right: [-0.08, -0.46, 0.16] as V3 }, poles: bothDir(0.4, 0, -1), hipsY: -0.04 },
  t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number],
};

/** ex_inverted_row — under a waist-high bar, the heels on the floor, the body one straight line: pull the chest to the bar. */
function invertedRow(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = { LeftFoot: [-24, 0, 0] as Deg3, RightFoot: [-24, 0, 0] as Deg3 };
  const p = (hips: number, hy: number, poles: Pair): Pose => ({ bones: { Hips: [hips, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], ...legs }, feet: both(0.12, 0.07, 0.86), kneePoles: bothDir(0, 1, 0), handsAt: both(0.26, 0.98, -0.36), poles, hipsY: hy, hipsZ: 0.08 });
  return run(scene, sk, 'ex_inverted_row', 2.4, [at(p(-71, -0.64, bothDir(0.6, -0.6, 0.5)), 0, true), at(p(-58, -0.42, bothDir(0.6, -1, 0.4)), 0.8, true), at(p(-58, -0.42, bothDir(0.6, -1, 0.4)), 1.1, true)], true);
}

/** ex_dip / ex_dip_hold — on the parallel bars, arms long: lower until the elbows are bent to a right angle and press up. */
function dip(scene: Scene, sk: Skeleton, name: string, hold: boolean): AnimationGroup | null {
  const legs = { LeftUpLeg: [14, 0, 2] as Deg3, RightUpLeg: [14, 0, -2] as Deg3, LeftLeg: [76, 0, 0] as Deg3, RightLeg: [76, 0, 0] as Deg3, LeftFoot: [20, 0, 0] as Deg3, RightFoot: [20, 0, 0] as Deg3 };
  const top: Pose = { bones: { Hips: [6, 0, 0], Spine: [2, 0, 0], ...legs }, handsAt: both(0.27, 1.14, 0.02), poles: bothDir(0.2, 0, -1), hipsY: 0.24 };
  if (hold) return loop(scene, sk, name, 3.0, [at(top, 0, true), at({ ...top, bones: { ...top.bones, Spine1: [-2, 0, 0] } }, 1.5, true)]);
  const low: Pose = { bones: { Hips: [16, 0, 0], Spine: [4, 0, 0], ...legs }, handsAt: both(0.27, 1.14, 0.06), poles: bothDir(0.15, 0, -1), hipsY: -0.04, hipsZ: -0.04 };
  return run(scene, sk, name, 2.4, [at(top, 0, true), at(low, 0.9, true), at(low, 1.1, true)]);
}
/** ex_bench_dip (/ _bent) — the hands on a bench edge behind, the legs long (or bent) in front: lower the hips toward the floor
 *  by bending the elbows straight back, press up. */
function benchDip(scene: Scene, sk: Skeleton, name: string, bent: boolean): AnimationGroup | null {
  const feet = bent ? both(0.13, ANKLE, 0.40) : both(0.12, 0.07, 0.66);
  const legBones: Record<string, Deg3> = bent ? {} : { LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] };
  const top: Pose = { bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], ...legBones }, feet, kneePoles: bothDir(0.1, 1, 0.4), handsAt: both(0.22, BENCH_TOP + 0.02, -0.30), poles: bothDir(0, 0, -1), hipsY: -0.46, hipsZ: -0.18 };
  const low: Pose = { ...top, bones: { Hips: [4, 0, 0], Spine: [2, 0, 0], ...legBones }, hipsY: -0.74, hipsZ: -0.16 };
  return run(scene, sk, name, 2.4, [at(top, 0, true), at(low, 0.9, true), at(low, 1.1, true)], true);
}

// ── push-ups with the hands or feet raised, against a wall, off the floor ────────────────────────────────────────────
function pushVariant(scene: Scene, sk: Skeleton, name: string, top: Pose, bottom: Pose, dur = 2.2): AnimationGroup | null {
  return run(scene, sk, name, dur, [at(top, 0, true), at(bottom, dur * 0.42, true), at(bottom, dur * 0.5, true)], true);
}
const PUSH_FEET = { LeftFoot: [8, 0, 0] as Deg3, RightFoot: [8, 0, 0] as Deg3 };
const INCLINE_TOP: Pose = { bones: { Hips: [56, 0, 0], Spine: [0, 0, 0], Neck: [-20, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: both(0.11, TOE_ANKLE + 0.04, -0.78), kneePoles: bothDir(0, -1, 0.1), handsAt: both(0.24, BENCH_TOP + 0.03, 0.52), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.36, hipsZ: -0.04 };
const INCLINE_LOW: Pose = { ...INCLINE_TOP, bones: { ...INCLINE_TOP.bones, Hips: [66, 0, 0] }, handsAt: both(0.27, BENCH_TOP + 0.03, 0.52), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.52 };
const DECLINE_TOP: Pose = { bones: { Hips: [86, 0, 0], Spine: [0, 0, 0], Neck: [-36, 0, 0], ...PUSH_FEET }, feet: both(0.11, BENCH_TOP + 0.10, -0.92), kneePoles: bothDir(0, -1, 0.1), hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.48 };
const DECLINE_LOW: Pose = { ...DECLINE_TOP, bones: { ...DECLINE_TOP.bones, Hips: [96, 0, 0], Neck: [-44, 0, 0] }, hands: both(0.27, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.66 };
const WALL_TOP: Pose = { bones: { Hips: [12, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0] }, feet: both(0.12, ANKLE + 0.02, -0.06), kneePoles: bothDir(0, 0, 1), handsAt: both(0.24, 1.30, 0.67), poles: bothDir(0.6, -0.3, -0.6), hipsY: -0.02 };
const WALL_LOW: Pose = { ...WALL_TOP, bones: { ...WALL_TOP.bones, Hips: [22, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0] }, feet: both(0.12, ANKLE + 0.06, -0.06), handsAt: both(0.27, 1.30, 0.67), poles: bothDir(0.8, -0.2, -0.5), hipsY: -0.04, hipsZ: 0.10 };
/** ex_plyo_pushup — the push-up driven hard enough that the hands leave the floor at the top, and land soft. */
function plyoPushup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const low: Pose = { ...HIGH_PLANK, bones: { ...HIGH_PLANK.bones, Hips: [84, 0, 0], Neck: [-40, 0, 0] }, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
  const air: Pose = { ...HIGH_PLANK, bones: { ...HIGH_PLANK.bones, Hips: [62, 0, 0] }, hands: both(0.24, 0.20, 0.42), poles: bothDir(0.5, 0.2, -0.8), hipsY: -0.48 };
  return run(scene, sk, 'ex_plyo_pushup', 1.8, [at(HIGH_PLANK, 0, true), at(low, 0.6, true), at(air, 0.9, true), at(HIGH_PLANK, 1.2, true)], true);
}
/** ex_hand_release — the push-up lowered all the way to the floor, the hands lifted off it for a beat, then pressed up. */
function handRelease(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const flat: Pose = { ...PRONE, bones: { ...PRONE.bones, LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: both(0.11, TOE_ANKLE, -0.90), kneePoles: bothDir(0, -1, 0.1), hands: both(0.26, 0.06, 0.40), poles: bothDir(0.7, 0.5, -0.4) };
  const lifted: Pose = { ...flat, hands: both(0.46, 0.16, 0.28), poles: bothDir(0.3, 1, 0) };
  return run(scene, sk, 'ex_hand_release', 2.6, [at(HIGH_PLANK, 0, true), at(flat, 0.8, true), at(lifted, 1.1, true), at(flat, 1.4, true), at(HIGH_PLANK, 2.1, true)], true);
}

// ── curls and rows on an incline, a prone pad, a preacher pad ─────────────────────────────────────────────────────────
/** On a 45° incline bench (exerciseKit INCLINED): the arms hang straight down behind the trunk line; the curl. */
const INCLINE_CURL = {
  a: { ...INCLINED, rel: both(0.05, -0.52, 0.0), poles: bothDir(0.2, 0, -1), hipsY: INCLINE_Y },
  b: { ...INCLINED, rel: both(0.03, -0.20, 0.20), poles: bothDir(0.2, -1, -0.2), hipsY: INCLINE_Y },
  t: [0.8, 0.2, 1.0, 0.3] as [number, number, number, number],
};
/** Chest down on a pad inclined ~38° (the prone incline / chest-supported bench), the feet on the floor behind. */
const PRONE_PAD: Pose = { bones: { Hips: [52, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-44, 0, 0], RightFoot: [-44, 0, 0] }, feet: both(0.14, ANKLE + 0.02, -0.80), kneePoles: bothDir(0.1, 0, 1), hipsY: -0.33, hipsZ: -0.42 };
const PAD = (rel: Pair, poles: Pair): Pose => ({ ...PRONE_PAD, rel, poles });
const PAD_HANG = both(0.04, -0.52, 0.0);
const SPIDER_CURL = { a: PAD(PAD_HANG, bothDir(0.2, 0, -1)), b: PAD(both(0.02, -0.24, 0.18), bothDir(0.2, -1, -0.2)), t: [0.8, 0.2, 1.0, 0.3] as [number, number, number, number] };
const CHEST_ROW = { a: PAD(PAD_HANG, bothDir(0.4, 0, -1)), b: PAD(both(0.02, -0.26, -0.22), bothDir(0.4, 0.6, -0.8)), t: [0.7, 0.3, 0.9, 0.3] as [number, number, number, number] };
const PAD_Y = { a: PAD(PAD_HANG, bothDir(0.4, 0, -1)), b: PAD(both(0.24, 0.30, 0.42), bothDir(0.4, 1, 0)), t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number] };
const PAD_T = { a: PAD(PAD_HANG, bothDir(0.4, 0, -1)), b: PAD(both(0.52, -0.06, 0.02), bothDir(0.2, 1, 0)), t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number] };
const PAD_W = { a: PAD(PAD_HANG, bothDir(0.4, 0, -1)), b: PAD(both(0.28, -0.08, -0.12), bothDir(0.4, 0.4, -1)), t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number] };
/** The preacher curl: seated, the upper arms down a pad sloping away in front: from the arms long down the pad to curled up. */
const PREACHER_BASE: Pose = { ...SEATED, bones: { ...SEATED.bones, Hips: [8, 0, 0] }, hipsY: SEAT_Y };
const PREACHER = {
  a: { ...PREACHER_BASE, hands: both(0.18, 0.54, 0.58), poles: bothDir(0.3, 1, 0.4) },
  b: { ...PREACHER_BASE, hands: both(0.17, 1.00, 0.30), poles: bothDir(0.2, -0.4, 1) },
  t: [0.8, 0.2, 1.0, 0.3] as [number, number, number, number],
};
/** The concentration curl: seated, leaning over, the right elbow braced inside the right thigh: the dumbbell curls up. */
function concentration(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Pose = { ...SEATED, bones: { ...SEATED.bones, Hips: [30, 0, 0], Spine: [10, 0, 0], Neck: [-20, 0, 0] }, feet: both(0.30, ANKLE, 0.44), kneePoles: bothDir(0.5, 0.3, 1), hipsY: SEAT_Y };
  const down: Pose = { ...base, hands: { Right: [0.12, 0.22, 0.42], Left: [-0.26, 0.56, 0.36] }, poles: { Right: [0.8, 0.2, 0], Left: [-0.8, -0.4, 0] } };
  const up: Pose = { ...base, hands: { Right: [0.06, 0.62, 0.32], Left: [-0.26, 0.56, 0.36] }, poles: { Right: [0.8, -0.3, 0.2], Left: [-0.8, -0.4, 0] } };
  return run(scene, sk, 'ex_concentration_curl', 2.3, [at(down, 0, true), at(up, 0.8, true), at(up, 1.0, true)], true);
}

const one = (name: string, p: { a: Pose; b: Pose; t: [number, number, number, number] }, free?: Pose): [string, Builder] => [name, (scene, sk) => rep2(scene, sk, name, oneArm(p, free))];
const two = (name: string, p: { a: Pose; b: Pose; t: [number, number, number, number] }): [string, Builder] => [name, (scene, sk) => rep2(scene, sk, name, p)];
/** Arm after arm (exerciseMore.ts alternating, over these pairs). */
const alt = (name: string, p: { a: Pose; b: Pose; t: [number, number, number, number] }): [string, Builder] => [name, (scene, sk) => {
  const D = p.t.reduce((x, y) => x + y, 0);
  const r = sides(p.b, p.a), l = sides(p.a, p.b);
  return run(scene, sk, name, 2 * D, [at(p.a, 0, true), at(r, p.t[0], true), at(r, p.t[0] + p.t[1], true), at(p.a, D - p.t[3], true), at(p.a, D, true), at(l, D + p.t[0], true), at(l, D + p.t[0] + p.t[1], true), at(p.a, 2 * D - p.t[3], true)], true);
}];

export const PROP_BUILDERS: readonly [string, Builder][] = [
  ['ex_step_up', (scene, sk) => stepUp(scene, sk, 'ex_step_up', false)], ['ex_step_up_knee', (scene, sk) => stepUp(scene, sk, 'ex_step_up_knee', true)], ['ex_step_up_lat', stepUpLateral],
  ['ex_step_down', (scene, sk) => stepDown(scene, sk, 'ex_step_down', false)], ['ex_step_down_lat', (scene, sk) => stepDown(scene, sk, 'ex_step_down_lat', true)],
  ['ex_sl_box_squat', slBoxSquat], ['ex_pistol', (scene, sk) => pistol(scene, sk, 'ex_pistol', ARMS_FWD)], ['ex_pistol_goblet', (scene, sk) => pistol(scene, sk, 'ex_pistol_goblet', CHEST)], ['ex_skater_squat', skaterSquat],
  ['ex_bulgarian', (scene, sk) => bulgarian(scene, sk, 'ex_bulgarian', false)], ['ex_bulgarian_bar', (scene, sk) => bulgarian(scene, sk, 'ex_bulgarian_bar', true)],
  ['ex_lying_leg_curl', lyingLegCurl], ['ex_seated_leg_curl', (scene, sk) => seatedKnee(scene, sk, 'ex_seated_leg_curl', 4, 100, false)],
  ['ex_leg_extension', (scene, sk) => seatedKnee(scene, sk, 'ex_leg_extension', 92, 6, false)], ['ex_leg_extension_one', (scene, sk) => seatedKnee(scene, sk, 'ex_leg_extension_one', 92, 6, true)],
  ['ex_seated_calf', seatedCalf], ['ex_standing_leg_curl', standingLegCurl],
  ['ex_hip_thrust', (scene, sk) => hipThrust(scene, sk, 'ex_hip_thrust', false)], ['ex_hip_thrust_sl', (scene, sk) => hipThrust(scene, sk, 'ex_hip_thrust_sl', true)],
  ['ex_bridge_march', bridgeMarch], ['ex_bridge_sl', bridgeSl], ['ex_bridge_feetup', bridgeFeetUp], ['ex_slider_curl', sliderCurl], ['ex_nordic', nordic],
  ['ex_pullup', (scene, sk) => hang(scene, sk, 'ex_pullup', 'pull')], ['ex_chinup', (scene, sk) => hang(scene, sk, 'ex_chinup', 'chin')],
  ['ex_dead_hang', (scene, sk) => hang(scene, sk, 'ex_dead_hang', 'hang')], ['ex_scap_pullup', (scene, sk) => hang(scene, sk, 'ex_scap_pullup', 'scap')],
  two('ex_pulldown', PULLDOWN), two('ex_pulldown_close', PULLDOWN_CLOSE), one('ex_pulldown_one', PULLDOWN, { ...PULLDOWN.a, rel: undefined, hands: { Left: [-0.24, 0.86 + SEAT_Y, 0.06] }, poles: { Left: [-0.2, -0.3, -0.9] } }),
  two('ex_straight_arm_pulldown', STRAIGHT_PULLDOWN),
  ['ex_inverted_row', invertedRow], ['ex_dip', (scene, sk) => dip(scene, sk, 'ex_dip', false)], ['ex_dip_hold', (scene, sk) => dip(scene, sk, 'ex_dip_hold', true)],
  ['ex_bench_dip', (scene, sk) => benchDip(scene, sk, 'ex_bench_dip', false)], ['ex_bench_dip_bent', (scene, sk) => benchDip(scene, sk, 'ex_bench_dip_bent', true)],
  ['ex_incline_pushup', (scene, sk) => pushVariant(scene, sk, 'ex_incline_pushup', INCLINE_TOP, INCLINE_LOW)],
  ['ex_decline_pushup', (scene, sk) => pushVariant(scene, sk, 'ex_decline_pushup', DECLINE_TOP, DECLINE_LOW)],
  ['ex_wall_pushup', (scene, sk) => pushVariant(scene, sk, 'ex_wall_pushup', WALL_TOP, WALL_LOW)],
  ['ex_plyo_pushup', plyoPushup], ['ex_hand_release', handRelease],
  two('ex_incline_curl', INCLINE_CURL), alt('ex_incline_curl_alt', INCLINE_CURL),
  two('ex_spider_curl', SPIDER_CURL), two('ex_chest_row', CHEST_ROW), two('ex_incline_y', PAD_Y), two('ex_incline_t', PAD_T), two('ex_incline_w', PAD_W),
  two('ex_preacher_curl', PREACHER), one('ex_preacher_curl_one', PREACHER), ['ex_concentration_curl', concentration],
];
