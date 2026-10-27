// Exercise demos (LIBRARY-ANATOMY, 2026-10-25) — the exercise library's avatar loops.
//
// Owner decision (2026-10-25): every library exercise is demonstrated four ways, and one of them is the athlete's own
// avatar doing it. These are the loops the library plays (lib/library/demo.ts demoClipFor picks one per entry from its
// pattern, family and variation; an entry with no faithful loop shows the cue card instead — never a wrong movement).
//
// AUTHORING: pose clips (poseClip.ts), the repo's body-independent form — torso and legs in degrees about the parent's
// bind axes, wrists and ankles as targets the two-bone solver reaches on the live skeleton, so one authoring plays on
// every body that passes Gate 0 (the kit bodies, the scan, the roster). Two conventions this file adds on top:
//   · targets are written in the FINAL frame (where the wrist or ankle is once the key's hipsY has lowered the body),
//     and `k()` converts them back to the solver's frame. A squat's planted ankle is then the same number on every key,
//     which is what planted means.
//   · a hand that rides the torso (a bar on the back, a goblet at the chest, hands behind the head) is `handsRel` — from
//     the posed shoulder — so it follows the lean without a hand-solved target per key.
// Every clip loops: the last key is the first key's pose (closesLoop), so the smoothing's ends are periodic.
// Root translation is never carried (the stage holds the body still); a lunge steps and comes back.
//
// Conventions read off the existing suites (and re-measured by exercise.test.ts): +x is the body's right, +z its front;
// Spine/Hips +x leans forward (Hips +80 is face-down, −80 face-up); UpLeg −x lifts the thigh forward; Leg +x bends the
// knee; UpLeg z spreads the knees (+ on the left, − on the right).
//
// SUITE: every name is `ex_*` (clipScope.ts suite 'exercise'), an OPT-IN suite: only a scene whose scope names it (the
// library stage, felModeId 'library') builds these, so no mode and no unscoped preview pays for 30 extra builds at spawn.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, mix, loop, rep, STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_DOWN, ELBOWS_BACK, ELBOWS_OUT,
  ELBOWS_UP, STAND, HIGH_PLANK, UPPER, repOf, type Deg3, type ExKey, type Pair, type V3,
} from './exerciseKit';
import { MORE_BUILDERS } from './exerciseMore';
import { FLOOR_BUILDERS } from './exerciseFloor';
import { ATHLETIC_BUILDERS } from './exerciseAthletic';
import { BODY_BUILDERS } from './exerciseBody';
import { PROP_BUILDERS } from './exerciseProps';
import { VARIANT_BUILDERS } from './exerciseVariants';
import { DRILL_BUILDERS } from './exerciseDrills';
import { SIGNATURE_BUILDERS } from './exerciseSignature';


// ── lower body ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_squat — a two-foot squat to depth, hands together at the chest (goblet / bodyweight). */
export function buildExSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top = { bones: { ...STAND, Hips: [4, 0, 0] as Deg3 }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.13, -0.24, 0.26] as V3, Right: [-0.13, -0.24, 0.26] as V3 }, poles: ELBOWS_DOWN, hipsY: 0 };
  const bottom = { bones: { Hips: [26, 0, 0] as Deg3, Spine: [10, 0, 0] as Deg3, Spine1: [0, 0, 0] as Deg3, Neck: [-18, 0, 0] as Deg3, LeftFoot: [-34, 0, 0] as Deg3, RightFoot: [-34, 0, 0] as Deg3 }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.13, -0.26, 0.30] as V3, Right: [-0.13, -0.26, 0.30] as V3 }, poles: ELBOWS_DOWN, hipsY: -0.40 };
  return rep(scene, sk, 'ex_squat', top, bottom, 1.1, 0.25, 0.9, 0.45);
}

/** ex_squat_bar — the same squat with the hands up at the shoulders, holding a bar across the upper back. */
export function buildExSquatBar(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const bar: Pair = { Left: [-0.24, 0.02, -0.10], Right: [0.24, 0.02, -0.10] };
  // the wrists bent so the hands close over a bar at the shoulders; an open hand left straight up read as hands raised.
  // The SAME sign on both sides is what the live stage shows symmetric (rig shots 2026-10-25: −85 on the right alone
  // left the left hand open and up there, though the node rig's finger-axis measure suggested mirrored signs)
  const grip = { LeftHand: [0, 0, -85] as Deg3, RightHand: [0, 0, -85] as Deg3 };
  const top = { bones: { ...STAND, ...grip, Hips: [4, 0, 0] as Deg3 }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: bar, poles: bothDir(0.3, -1, -0.3), hipsY: 0 };
  const bottom = { bones: { ...grip, Hips: [30, 0, 0] as Deg3, Spine: [8, 0, 0] as Deg3, Spine1: [0, 0, 0] as Deg3, Neck: [-20, 0, 0] as Deg3, LeftFoot: [-34, 0, 0] as Deg3, RightFoot: [-34, 0, 0] as Deg3 }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: bar, poles: bothDir(0.3, -1, -0.3), hipsY: -0.38 };
  return rep(scene, sk, 'ex_squat_bar', top, bottom, 1.1, 0.25, 0.9, 0.45);
}

/** ex_hinge — a hip hinge (RDL / deadlift / kettlebell deadlift): soft knees, hips back, hands down the front of the legs. */
export function buildExHinge(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.13, ANKLE, 0.16);
  const top = { bones: { ...STAND, LeftLeg: [6, 0, 0] as Deg3, RightLeg: [6, 0, 0] as Deg3 }, feet, rel: { Left: [0.04, -0.52, 0.10] as V3, Right: [-0.04, -0.52, 0.10] as V3 }, poles: HANG_POLES, hipsY: 0 };
  const bottom = { bones: { Hips: [62, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Spine1: [0, 0, 0] as Deg3, Neck: [-30, 0, 0] as Deg3 }, feet, rel: { Left: [0.05, -0.53, 0.02] as V3, Right: [-0.05, -0.53, 0.02] as V3 }, poles: HANG_POLES, hipsY: -0.10 };
  return rep(scene, sk, 'ex_hinge', top, bottom, 1.1, 0.2, 1.0, 0.4);
}

/** ex_good_morning — the hinge with the hands behind the head (good morning, hip-hinge drill). */
export function buildExGoodMorning(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.16);
  const head: Pair = { Left: [0.12, 0.17, -0.10], Right: [-0.12, 0.17, -0.10] };
  const top = { bones: { ...STAND, LeftLeg: [6, 0, 0] as Deg3, RightLeg: [6, 0, 0] as Deg3 }, feet, rel: head, poles: ELBOWS_UP, hipsY: 0 };
  const bottom = { bones: { Hips: [62, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Spine1: [0, 0, 0] as Deg3, Neck: [-24, 0, 0] as Deg3 }, feet, rel: { Left: [0.12, 0.12, 0.14] as V3, Right: [-0.12, 0.12, 0.14] as V3 }, poles: bothDir(0.8, 0.2, 0.4), hipsY: -0.10 };
  return rep(scene, sk, 'ex_good_morning', top, bottom, 1.1, 0.2, 1.0, 0.4);
}

/** ex_split_squat — a static split stance, straight down and up (split squat; the back heel up). */
export function buildExSplitSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet: Pair = { Left: [-0.13, ANKLE, 0.30], Right: [0.13, 0.13, -0.36] };
  const top = { bones: { ...STAND, RightFoot: [18, 0, 0] as Deg3 }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.84 - 0.08, 0.06), poles: HANG_POLES, hipsY: -0.08 };
  const bottom = { bones: { ...STAND, Spine: [4, 0, 0] as Deg3, RightFoot: [-6, 0, 0] as Deg3, LeftFoot: [-14, 0, 0] as Deg3 }, feet, kneePoles: { Left: [-0.1, 0, 1] as V3, Right: [0, -1, 0.3] as V3 }, hands: both(0.24, 0.84 - 0.38, 0.06), poles: HANG_POLES, hipsY: -0.42 };
  return rep(scene, sk, 'ex_split_squat', top, bottom, 1.0, 0.2, 0.9, 0.35);
}

/** A stepping lunge: the left foot leaves, lands `stepZ` away, the body drops between the feet and pushes back. */
function lunge(scene: Scene, sk: Skeleton, name: string, stepZ: number): AnimationGroup | null {
  const home: Pair = both(0.12, ANKLE, 0.04);
  const fwd = stepZ > 0;
  const out: V3 = [-0.13, ANKLE, 0.04 + stepZ];
  const air: V3 = [-0.13, ANKLE + 0.12, 0.04 + stepZ * 0.55];
  // the planted foot stays where it was; in the bottom the back foot is the rear one (on its toes)
  const lowFeet: Pair = { Left: out, Right: [0.12, fwd ? ANKLE + 0.05 : ANKLE, 0.04] };
  const bottomKnees: Pair = fwd ? { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] } : { Left: [0, -1, 0.3], Right: [0.1, 0, 1] };
  const hands = (drop: number): Pair => both(0.24, 0.84 - drop, 0.06);
  const k0: ExKey = { t: 0, bones: STAND, feet: home, hands: hands(0), poles: HANG_POLES, hipsY: 0, hold: true };
  const step: ExKey = { t: 0.35, bones: { ...STAND, LeftUpLeg: fwd ? [-40, 0, 0] : [10, 0, 0] }, feet: { Left: air, Right: home.Right }, kneePoles: bothDir(0, 0, 1), hands: hands(0.02), poles: HANG_POLES, hipsY: -0.02 };
  const lowBones = { ...STAND, Spine: [fwd ? 6 : 10, 0, 0] as Deg3, ...(fwd ? { RightFoot: [-6, 0, 0] as Deg3, LeftFoot: [22, 0, 0] as Deg3 } : { LeftFoot: [-6, 0, 0] as Deg3, RightFoot: [-30, 0, 0] as Deg3 }) };
  const lowF: Pair = fwd ? lowFeet : { Left: [-0.13, ANKLE + 0.05, 0.04 + stepZ], Right: home.Right };
  const land: ExKey = { t: 0.7, bones: { ...STAND, Spine: [fwd ? 6 : 10, 0, 0], ...(fwd ? { RightFoot: [10, 0, 0] as Deg3, LeftFoot: [14, 0, 0] as Deg3 } : { LeftFoot: [10, 0, 0] as Deg3, RightFoot: [-16, 0, 0] as Deg3 }) }, feet: lowF, kneePoles: bottomKnees, hands: hands(0.12), poles: HANG_POLES, hipsY: -0.14 };
  const bottom: ExKey = { t: 1.15, bones: lowBones, feet: lowF, kneePoles: bottomKnees, hands: hands(0.40), poles: HANG_POLES, hipsY: -0.42, hold: true };
  const back: ExKey = { t: 1.9, bones: { ...STAND, LeftUpLeg: fwd ? [-40, 0, 0] : [10, 0, 0] }, feet: { Left: air, Right: home.Right }, kneePoles: bothDir(0, 0, 1), hands: hands(0.03), poles: HANG_POLES, hipsY: -0.03 };
  // the drop and the drive back are each solved half-way too (mix), so the planted foot holds its spot between the keys
  return loop(scene, sk, name, 2.6, [
    k0, step, land,
    { ...mix(land, bottom, 0.5), t: 0.92 },
    bottom, { ...bottom, t: 1.45 },
    { ...mix(bottom, { ...land, feet: lowF }, 0.5), t: 1.62 },
    { ...mix({ ...land, feet: lowF }, back, 0.5), t: 1.76, feet: { Left: [-0.13, ANKLE + 0.06, 0.04 + stepZ * 0.8], Right: home.Right } },
    back,
    { t: 2.25, bones: STAND, feet: home, hands: hands(0), poles: HANG_POLES, hipsY: 0, hold: true },
  ]);
}
/** ex_lunge — a forward lunge and back (lunge, walking-lunge pattern shown in place). */
export const buildExLunge = (scene: Scene, sk: Skeleton) => lunge(scene, sk, 'ex_lunge', 0.62);
/** ex_reverse_lunge — the step goes back. */
export const buildExReverseLunge = (scene: Scene, sk: Skeleton) => lunge(scene, sk, 'ex_reverse_lunge', -0.62);

/** ex_calf_raise — up onto the toes and down (calf raise, heel raise). */
export function buildExCalfRaise(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down = { bones: STAND, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const up = { bones: { ...STAND, LeftFoot: [34, 0, 0] as Deg3, RightFoot: [34, 0, 0] as Deg3 }, feet: both(0.13, ANKLE + 0.09, 0.08), hands: both(0.24, 0.84 + 0.09, 0.06), poles: HANG_POLES, hipsY: 0.09 };
  return rep(scene, sk, 'ex_calf_raise', down, up, 0.6, 0.4, 0.7, 0.3);
}

/** ex_jump — a countermovement jump: dip with the arms back, drive the arms up and leave the floor, land soft. */
export function buildExJump(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
  return loop(scene, sk, 'ex_jump', 2.0, [
    { t: 0, bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0, hold: true },
    { t: 0.45, bones: { Hips: [24, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, -0.30), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28, hold: true },
    // take-off: arms driven up, legs long, toes pointed — the body leaves the floor (hipsY > 0, no foot targets)
    { t: 0.68, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-4, 4), LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hands: both(0.20, 2.05 + 0.10, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.10 },
    { t: 0.88, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-10, 14), LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, hands: both(0.22, 2.0 + 0.24, 0.14), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.24, hold: true },
    { t: 1.1, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...legs(-14, 18), LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, hands: both(0.24, 1.70 + 0.06, 0.20), poles: bothDir(0.6, -0.2, -0.6), hipsY: 0.06 },
    // land: soft knees, hips back, arms forward
    { t: 1.3, bones: { Hips: [20, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.92 - 0.22, 0.34), poles: HANG_POLES, hipsY: -0.22, hold: true },
    { t: 1.7, bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 },
  ]);
}

/** ex_pogo — quick small hops off the ankles, knees nearly straight (pogo, ankle hops). */
export function buildExPogo(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const air = { bones: { ...STAND, LeftUpLeg: [-4, 0, 3] as Deg3, RightUpLeg: [-4, 0, -3] as Deg3, LeftLeg: [6, 0, 0] as Deg3, RightLeg: [6, 0, 0] as Deg3, LeftFoot: [28, 0, 0] as Deg3, RightFoot: [28, 0, 0] as Deg3 }, hands: both(0.26, 0.98 + 0.12, 0.16), poles: ELBOWS_BACK, hipsY: 0.12 };
  const ground = { bones: { ...STAND, Hips: [4, 0, 0] as Deg3 }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), hands: both(0.26, 0.96 - 0.05, 0.16), poles: ELBOWS_BACK, hipsY: -0.05 };
  return loop(scene, sk, 'ex_pogo', 0.5, [{ ...ground, t: 0 }, { ...air, t: 0.25 }]);
}

/** ex_jump_rope — the pogo bounce with the hands low at the hips turning the rope. */
export function buildExJumpRope(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feetAir = { LeftUpLeg: [-3, 0, 3] as Deg3, RightUpLeg: [-3, 0, -3] as Deg3, LeftLeg: [5, 0, 0] as Deg3, RightLeg: [5, 0, 0] as Deg3, LeftFoot: [24, 0, 0] as Deg3, RightFoot: [24, 0, 0] as Deg3 };
  const hand = (a: number, lift: number): Pair => both(0.32 + 0.04 * Math.cos(a), 0.92 + 0.05 * Math.sin(a) + lift, 0.10 + 0.05 * Math.cos(a));
  return loop(scene, sk, 'ex_jump_rope', 0.5, [
    { t: 0, bones: { ...STAND, Hips: [3, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), hands: hand(0, -0.04), poles: ELBOWS_BACK, hipsY: -0.04 },
    { t: 0.125, bones: { ...STAND, ...feetAir }, hands: hand(Math.PI / 2, 0.05), poles: ELBOWS_BACK, hipsY: 0.05 },
    { t: 0.25, bones: { ...STAND, ...feetAir }, hands: hand(Math.PI, 0.08), poles: ELBOWS_BACK, hipsY: 0.08 },
    { t: 0.375, bones: { ...STAND, ...feetAir }, hands: hand(1.5 * Math.PI, 0.04), poles: ELBOWS_BACK, hipsY: 0.04 },
  ]);
}

/** ex_march — a high-knee march in place, the opposite arm driving (march, A-march). */
export function buildExMarch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const side = (s: 1 | -1): ExKey => {
    const up = s > 0 ? 'Left' : 'Right', down = s > 0 ? 'Right' : 'Left';
    return {
      t: 0, bones: { ...STAND, [`${up}UpLeg`]: [-80, 0, 0], [`${up}Leg`]: [90, 0, 0], [`${up}Foot`]: [10, 0, 0] } as Record<string, Deg3>,
      feet: { [down]: [down === 'Left' ? -0.12 : 0.12, ANKLE, 0.04] } as Pair,
      hands: { [down]: [down === 'Left' ? -0.20 : 0.20, 1.20, 0.30], [up]: [up === 'Left' ? -0.24 : 0.24, 0.92, -0.20] } as Pair,
      poles: bothDir(0.3, -0.6, -0.7), hipsY: 0.0,
    };
  };
  const mid: ExKey = { t: 0, bones: STAND, feet: both(0.12, ANKLE, 0.04), hands: HANG, poles: HANG_POLES, hipsY: 0 };
  return loop(scene, sk, 'ex_march', 1.6, [{ ...mid, t: 0 }, { ...side(1), t: 0.4, hold: true }, { ...mid, t: 0.8 }, { ...side(-1), t: 1.2, hold: true }]);
}

/** ex_carry — a loaded carry walked in place: tall, the arms long and still at the sides (farmer's carry, suitcase). */
export function buildExCarry(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const step = (s: 1 | -1, t: number): ExKey => ({
    t, bones: { ...STAND, Spine: [0, 0, 0], LeftUpLeg: [-22 * s, 0, 0], RightUpLeg: [22 * s, 0, 0], LeftLeg: [s > 0 ? 20 : 6, 0, 0], RightLeg: [s > 0 ? 6 : 20, 0, 0] },
    hands: both(0.27, 0.80, 0.02), poles: bothDir(0.3, -0.2, -0.9), hipsY: -0.01,
  });
  const pass = (t: number, s: 1 | -1): ExKey => ({
    t, bones: { ...STAND, Spine: [0, 0, 0], [`${s > 0 ? 'Right' : 'Left'}UpLeg`]: [-28, 0, 0], [`${s > 0 ? 'Right' : 'Left'}Leg`]: [40, 0, 0] } as Record<string, Deg3>,
    hands: both(0.27, 0.80, 0.02), poles: bothDir(0.3, -0.2, -0.9), hipsY: 0.0,
  });
  return loop(scene, sk, 'ex_carry', 1.2, [step(1, 0), pass(0.3, 1), step(-1, 0.6), pass(0.9, -1)]);
}

/** ex_jumping_jack — hop the feet wide as the arms sweep overhead, and back (jumping jack). */
export function buildExJumpingJack(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const closed = { bones: { ...STAND, Hips: [2, 0, 0] as Deg3 }, feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.86 - 0.03, 0.06), poles: HANG_POLES, hipsY: -0.03 };
  const air = (spread: number, armY: number, armX: number): ExKey => ({
    t: 0, bones: { ...STAND, LeftUpLeg: [0, 0, spread], RightUpLeg: [0, 0, -spread], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [18, 0, 0], RightFoot: [18, 0, 0] },
    hands: both(armX, armY + 0.06, 0.02), poles: bothDir(0.2, 0.4, -0.9), hipsY: 0.06,
  });
  const open = { bones: { ...STAND, Hips: [2, 0, 0] as Deg3 }, feet: both(0.36, ANKLE, 0.06), kneePoles: bothDir(0.3, 0, 1), hands: both(0.22, 2.02 - 0.03, 0.04), poles: bothDir(0.4, 0.3, -0.8), hipsY: -0.04 };
  return loop(scene, sk, 'ex_jumping_jack', 1.0, [
    { ...closed, t: 0 }, { ...air(10, 1.45, 0.66), t: 0.18 }, { ...open, t: 0.36, hold: true }, { ...open, t: 0.5 }, { ...air(10, 1.45, 0.66), t: 0.68 }, { ...closed, t: 0.86, hold: true },
  ]);
}

// ── upper body, standing ─────────────────────────────────────────────────────────────────────────────────────────────
// The two ends of each lift are data (exerciseKit.ts UPPER): the one-arm, alternating and kneeling versions
// (exerciseMore.ts) are made from the same two poses, so they are the same lift.

/** ex_press — a standing overhead press: from the front of the shoulders to locked out overhead. */
export const buildExPress = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_press', UPPER.press);
/** ex_curl — a standing curl: elbows still at the sides, the hands come up to the shoulders. */
export const buildExCurl = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_curl', UPPER.curl);
/** ex_lateral_raise — the arms rise out to the sides to shoulder height, elbows soft. */
export const buildExLateralRaise = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_lateral_raise', UPPER.lateral);
/** ex_front_raise — the arms rise straight out in front to shoulder height. */
export const buildExFrontRaise = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_front_raise', UPPER.front);
/** ex_row — a bent-over row: hinged to about 45°, the hands pull from under the shoulders to the lower ribs. */
export const buildExRow = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_row', UPPER.row);
/** ex_upright_row — the hands travel up the front of the body to the collarbones, elbows leading high. */
export const buildExUprightRow = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_upright_row', UPPER.upright);

/** ex_shrug — the shoulders lift toward the ears and lower, arms long. */
export function buildExShrug(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down = { bones: { ...STAND, LeftShoulder: [0, 0, 0] as Deg3, RightShoulder: [0, 0, 0] as Deg3 }, feet: STANCE, hands: both(0.24, 0.84, 0.06), poles: HANG_POLES, hipsY: 0 };
  const up = { bones: { ...STAND, LeftShoulder: [0, 0, 24] as Deg3, RightShoulder: [0, 0, -24] as Deg3 }, feet: STANCE, hands: both(0.24, 0.93, 0.06), poles: HANG_POLES, hipsY: 0 };
  return rep(scene, sk, 'ex_shrug', down, up, 0.5, 0.4, 0.6, 0.3);
}

/** ex_triceps_overhead — hands behind the head, elbows pointed up; the forearms extend to straight overhead. */
export const buildExTricepsOverhead = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_triceps_overhead', UPPER.tricepsOverhead);
/** ex_pushdown — elbows pinned at the sides, the hands press down from the chest to the thighs (cable pushdown). */
export const buildExPushdown = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_pushdown', UPPER.pushdown);

// ── on the floor ─────────────────────────────────────────────────────────────────────────────────────────────────────
// A face-down body is the Hips pitched forward (+x) with the hipsY that puts the wrists and toes on the floor; the
// feet are IK'd to one floor point so they stay put while the body lowers.

/** ex_pushup — from straight arms to the chest near the floor, the body one line (push-up). */
export function buildExPushup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.11, TOE_ANKLE, -0.90);
  const knees = bothDir(0, -1, 0.1);
  const top = { bones: { Hips: [70, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [-30, 0, 0] as Deg3, LeftFoot: [8, 0, 0] as Deg3, RightFoot: [8, 0, 0] as Deg3 }, feet, kneePoles: knees, hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  const bottom = { bones: { Hips: [84, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [-40, 0, 0] as Deg3, LeftFoot: [8, 0, 0] as Deg3, RightFoot: [8, 0, 0] as Deg3 }, feet, kneePoles: knees, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
  return rep(scene, sk, 'ex_pushup', top, bottom, 0.9, 0.15, 0.8, 0.35);
}

/** The top of a push-up (hands under the shoulders, arms long, one line from heels to head). */

/** ex_plank_high — the push-up's top, held, breathing (high plank, push-up hold at the top). */
export function buildExPlankHigh(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const b = (d: number): Omit<ExKey, 't'> => ({ ...HIGH_PLANK, bones: { ...HIGH_PLANK.bones, Hips: [70 - d, 0, 0] }, hipsY: (HIGH_PLANK.hipsY ?? 0) + d * 0.004 });
  return loop(scene, sk, 'ex_plank_high', 3.0, [{ ...b(0), t: 0 }, { ...b(1.2), t: 1.5 }]);
}

/** ex_mountain_climber — from the high plank, the knees drive to the chest one after the other. */
export function buildExMountainClimber(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const drive = (side: 'Left' | 'Right'): Omit<ExKey, 't'> => {
    const other = side === 'Left' ? 'Right' : 'Left';
    // the driving foot under the chest, off the floor, the knee pointing forward at the elbows; the other stays planted
    return { ...HIGH_PLANK, bones: { ...HIGH_PLANK.bones, Hips: [66, 0, 0], [`${side}Foot`]: [-24, 0, 0] }, feet: { [other]: HIGH_PLANK.feet![other], [side]: [side === 'Left' ? -0.12 : 0.12, 0.36, -0.16] } as Pair, kneePoles: { [other]: [0, -1, 0.1], [side]: [0, 0.3, 1] } as Pair, hipsY: -0.49 };
  };
  const L = drive('Left'), R = drive('Right');
  return loop(scene, sk, 'ex_mountain_climber', 0.9, [
    { ...HIGH_PLANK, t: 0 }, { ...mix(HIGH_PLANK, L, 0.5), t: 0.11 }, { ...L, t: 0.22, hold: true }, { ...mix(L, HIGH_PLANK, 0.5), t: 0.335 },
    { ...HIGH_PLANK, t: 0.45 }, { ...mix(HIGH_PLANK, R, 0.5), t: 0.56 }, { ...R, t: 0.67, hold: true }, { ...mix(R, HIGH_PLANK, 0.5), t: 0.785 },
  ]);
}

/** ex_plank — a forearm plank, held, breathing (plank, front plank holds). */
export function buildExPlank(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.11, TOE_ANKLE, -0.95);
  const pose = (breath: number): Omit<ExKey, 't'> => ({
    bones: { Hips: [78 - breath, 0, 0], Spine: [0, 0, 0], Neck: [-36, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] },
    feet, kneePoles: bothDir(0, -1, 0.1), hands: both(0.10, 0.06, 0.52), poles: bothDir(0.3, 0.2, -1), hipsY: -0.66 + breath * 0.004,
  });
  return loop(scene, sk, 'ex_plank', 3.0, [{ ...pose(0), t: 0 }, { ...pose(1.5), t: 1.5 }]);
}

/** ex_bridge — on the back, knees bent, feet flat: the hips lift to one line from knees to shoulders and lower. */
export function buildExBridge(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.50);
  const arms = both(0.30, 0.04, -0.20);
  // the shoulders stay on the floor: at the top the torso is pitched PAST horizontal (head lower than the hips), and the neck
  // folds so the head stays down
  const down = { bones: { Hips: [-86, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3 }, feet, kneePoles: bothDir(0.1, 1, 0.2), hands: arms, poles: bothDir(0.6, 0.3, 0), hipsY: -0.82 };
  const up = { bones: { Hips: [-118, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [34, 0, 0] as Deg3 }, feet, kneePoles: bothDir(0.1, 1, 0.4), hands: both(0.30, 0.04, -0.34), poles: bothDir(0.6, 0.3, 0), hipsY: -0.60 };
  return rep(scene, sk, 'ex_bridge', down, up, 0.8, 0.5, 0.9, 0.4);
}

/** ex_dead_bug — on the back, arms up, knees over the hips; the opposite arm and leg reach long and come back. */
export function buildExDeadBug(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Record<string, Deg3> = { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [-90, 0, 4], RightUpLeg: [-90, 0, -4], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0] };
  const armsUp = both(0.20, 0.62 + 0.86, 0.10);
  const reach = (s: 1 | -1): ExKey => {
    const leg = s > 0 ? 'Left' : 'Right', arm = s > 0 ? 'Right' : 'Left';
    return {
      t: 0, bones: { ...base, [`${leg}UpLeg`]: [-14, 0, 0], [`${leg}Leg`]: [8, 0, 0] } as Record<string, Deg3>,
      hands: { [leg]: armsUp[leg as 'Left' | 'Right'], [arm]: [arm === 'Left' ? -0.18 : 0.18, 0.15 + 0.86, -0.98] } as Pair,
      poles: bothDir(0.6, 0.2, 0), hipsY: -0.86,
    };
  };
  const mid: ExKey = { t: 0, bones: base, hands: armsUp, poles: bothDir(0.6, 0.2, 0), hipsY: -0.86 };
  return loop(scene, sk, 'ex_dead_bug', 3.2, [{ ...mid, t: 0, hold: true }, { ...reach(1), t: 0.8, hold: true }, { ...mid, t: 1.6, hold: true }, { ...reach(-1), t: 2.4, hold: true }]);
}

/** ex_bird_dog — on hands and knees; the opposite arm and leg reach long and come back. */
export function buildExBirdDog(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Record<string, Deg3> = { Hips: [90, 0, 0], Spine: [0, 0, 0], Neck: [-50, 0, 0], LeftUpLeg: [-90, 0, 0], RightUpLeg: [-90, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] };
  const hY = -0.40;
  const hands = both(0.18, 0.05, 0.52);
  const reach = (s: 1 | -1): ExKey => {
    const leg = s > 0 ? 'Left' : 'Right', arm = s > 0 ? 'Right' : 'Left';
    return {
      t: 0, bones: { ...base, [`${leg}UpLeg`]: [0, 0, 0], [`${leg}Leg`]: [4, 0, 0] } as Record<string, Deg3>,
      hands: { [leg]: hands[leg as 'Left' | 'Right'], [arm]: [arm === 'Left' ? -0.16 : 0.16, 0.58, 1.10] } as Pair,
      poles: bothDir(0.6, 0.2, -0.5), hipsY: hY,
    };
  };
  const mid: ExKey = { t: 0, bones: base, hands, poles: bothDir(0.6, 0.2, -0.5), hipsY: hY };
  return loop(scene, sk, 'ex_bird_dog', 3.6, [{ ...mid, t: 0, hold: true }, { ...reach(1), t: 0.9, hold: true }, { ...mid, t: 1.8, hold: true }, { ...reach(-1), t: 2.7, hold: true }]);
}

/** ex_crunch — on the back, knees bent; the shoulders curl up off the floor and back down (crunch, curl-up). */
export function buildExCrunch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.50);
  const legs = { kneePoles: bothDir(0.1, 1, 0.2) };
  const down = { bones: { Hips: [-84, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Spine1: [0, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3 }, feet, ...legs, rel: { Left: [0.16, 0.20, 0.0] as V3, Right: [-0.16, 0.20, 0.0] as V3 }, poles: bothDir(1, 0, 0), hipsY: -0.82 };
  const up = { bones: { Hips: [-80, 0, 0] as Deg3, Spine: [18, 0, 0] as Deg3, Spine1: [14, 0, 0] as Deg3, Neck: [14, 0, 0] as Deg3 }, feet, ...legs, rel: { Left: [0.16, 0.20, 0.0] as V3, Right: [-0.16, 0.20, 0.0] as V3 }, poles: bothDir(1, 0, 0), hipsY: -0.82 };
  return rep(scene, sk, 'ex_crunch', down, up, 0.7, 0.3, 0.8, 0.3);
}

// ── on a bench (the stage draws the bench: lib/library/demo.ts DEMO_PROPS) ─────────────────────────────────────────
// Seated: the hip joints a hand above the seat top (0.44 m), thighs level, feet flat. Lying: the back on the bench top, the
// feet on the floor either side of it, knees up. Incline: the seat, and the back pad at 45°.


/** ex_seated_press — the overhead press, seated on a bench. */
export const buildExSeatedPress = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_seated_press', UPPER.seatedPress);
/** ex_seated_curl — the curl, seated on the end of a bench, arms hanging beside it. */
export const buildExSeatedCurl = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_seated_curl', UPPER.seatedCurl);
/** ex_seated_lateral_raise — the lateral raise, seated. */
export const buildExSeatedLateralRaise = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_seated_lateral_raise', UPPER.seatedLateral);
/** ex_seated_triceps — the overhead triceps extension, seated. */
export const buildExSeatedTriceps = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_seated_triceps', UPPER.seatedTriceps);

/** ex_bench_press — on the back on a flat bench: the hands lower to the chest and press to straight arms over the shoulders. */
export const buildExBenchPress = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_bench_press', UPPER.bench);
/** ex_floor_press — the press lying on the floor, knees up: the upper arms stop on the floor. */
export function buildExFloorPress(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { Hips: [-88, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3 }, feet: both(0.20, ANKLE, 0.46), kneePoles: bothDir(0.1, 1, 0.3), hipsY: -0.84 };
  return rep(scene, sk, 'ex_floor_press', { ...base, hands: both(0.22, 0.70, -0.44), poles: bothDir(0.7, -0.5, 0) }, { ...base, hands: both(0.27, 0.30, -0.34), poles: bothDir(0.8, -0.6, 0) }, 0.9, 0.25, 0.8, 0.35);
}
/** ex_fly — on a flat bench: the arms open wide, elbows soft, and close back over the chest. */
export const buildExFly = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_fly', UPPER.fly);
/** ex_skull_crusher — on a flat bench, upper arms still and pointing up: the hands lower toward the forehead and press back. */
export const buildExSkullCrusher = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_skull_crusher', UPPER.skull);
/** ex_incline_press — on a bench inclined to 45°: from the top of the chest to straight arms over the shoulders. */
export const buildExInclinePress = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_incline_press', UPPER.inclinePress);
/** ex_incline_fly — the fly on a 45° bench. */
export const buildExInclineFly = (scene: Scene, sk: Skeleton) => repOf(scene, sk, 'ex_incline_fly', UPPER.inclineFly);

// ── mobility ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_arm_circles — arms out to the sides drawing circles (arm circles, shoulder circles). */
export function buildExArmCircles(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const N = 6, D = 1.2, keys: ExKey[] = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    keys.push({ t: (D * i) / N, bones: STAND, feet: STANCE, hands: both(0.78, 1.40 + 0.12 * Math.sin(a), 0.04 + 0.12 * Math.cos(a)), poles: bothDir(0, 0.3, -1), hipsY: 0 });
  }
  return loop(scene, sk, 'ex_arm_circles', D, keys);
}

/** ex_quad_stretch — standing on one leg, the hand holds the other ankle behind (standing quad stretch), then swaps. */
export function buildExQuadStretch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hold = (s: 1 | -1): ExKey => {
    const leg = s > 0 ? 'Left' : 'Right', other = s > 0 ? 'Right' : 'Left', x = s > 0 ? -1 : 1;
    return {
      t: 0, bones: { ...STAND, [`${leg}UpLeg`]: [12, 0, 0], [`${leg}Leg`]: [146, 0, 0] } as Record<string, Deg3>,
      feet: { [other]: [-x * 0.08, ANKLE, 0.04] } as Pair,
      // the wrist as far down the back of the leg as the arm reaches: the hand closes round the ankle
      hands: { [leg]: [x * 0.12, 0.86, -0.24], [other]: [-x * 0.40, 1.10, 0.10] } as Pair,
      poles: { [leg]: [x * 0.4, -0.2, -0.9], [other]: [-x * 0.9, -0.2, -0.2] } as Pair, hipsY: 0,
    };
  };
  const stand: ExKey = { t: 0, bones: STAND, feet: both(0.12, ANKLE, 0.04), hands: HANG, poles: HANG_POLES, hipsY: 0 };
  return loop(scene, sk, 'ex_quad_stretch', 6.0, [
    { ...stand, t: 0 }, { ...hold(1), t: 0.7, hold: true }, { ...hold(1), t: 2.4, hold: true }, { ...stand, t: 3.0 },
    { ...hold(-1), t: 3.7, hold: true }, { ...hold(-1), t: 5.4, hold: true },
  ]);
}

/** ex_breathe — standing tall, hands on the belly, a slow breath in and out. */
export function buildExBreathe(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const at = (inhale: number): Omit<ExKey, 't'> => ({
    bones: { ...STAND, Spine: [2 - inhale * 3, 0, 0], Spine1: [-inhale * 2, 0, 0], Neck: [inhale * 2, 0, 0] },
    feet: STANCE, hands: both(0.08, 1.02 + inhale * 0.01, 0.18 + inhale * 0.025), poles: ELBOWS_OUT, hipsY: inhale * 0.004,
  });
  return loop(scene, sk, 'ex_breathe', 6.0, [{ ...at(0), t: 0, hold: true }, { ...at(1), t: 2.5, hold: true }, { ...at(1), t: 3.2, hold: true }]);
}

/** Every exercise clip: [name, builder] — the authored index registers these under the opt-in 'exercise' suite. */
export const EXERCISE_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_squat', buildExSquat], ['ex_squat_bar', buildExSquatBar], ['ex_hinge', buildExHinge], ['ex_good_morning', buildExGoodMorning],
  ['ex_split_squat', buildExSplitSquat], ['ex_lunge', buildExLunge], ['ex_reverse_lunge', buildExReverseLunge],
  ['ex_calf_raise', buildExCalfRaise], ['ex_jump', buildExJump], ['ex_pogo', buildExPogo], ['ex_jump_rope', buildExJumpRope],
  ['ex_march', buildExMarch], ['ex_carry', buildExCarry], ['ex_jumping_jack', buildExJumpingJack],
  ['ex_press', buildExPress], ['ex_curl', buildExCurl], ['ex_lateral_raise', buildExLateralRaise], ['ex_front_raise', buildExFrontRaise],
  ['ex_row', buildExRow], ['ex_upright_row', buildExUprightRow], ['ex_shrug', buildExShrug], ['ex_triceps_overhead', buildExTricepsOverhead],
  ['ex_pushdown', buildExPushdown],
  ['ex_pushup', buildExPushup], ['ex_plank', buildExPlank], ['ex_plank_high', buildExPlankHigh], ['ex_mountain_climber', buildExMountainClimber], ['ex_bridge', buildExBridge], ['ex_dead_bug', buildExDeadBug],
  ['ex_bird_dog', buildExBirdDog], ['ex_crunch', buildExCrunch],
  ['ex_seated_press', buildExSeatedPress], ['ex_seated_curl', buildExSeatedCurl], ['ex_seated_lateral_raise', buildExSeatedLateralRaise],
  ['ex_seated_triceps', buildExSeatedTriceps], ['ex_bench_press', buildExBenchPress], ['ex_floor_press', buildExFloorPress], ['ex_fly', buildExFly],
  ['ex_skull_crusher', buildExSkullCrusher], ['ex_incline_press', buildExInclinePress], ['ex_incline_fly', buildExInclineFly],
  ['ex_arm_circles', buildExArmCircles], ['ex_quad_stretch', buildExQuadStretch], ['ex_breathe', buildExBreathe],
  // LIBRARY-ANATOMY-2: the one-arm, alternating and kneeling lifts (exerciseMore.ts)
  ...MORE_BUILDERS,
  // LIBRARY-ANATOMY-2: the mobility positions and the flows made of them (exerciseFloor.ts)
  ...FLOOR_BUILDERS,
  // LIBRARY-ANATOMY-2: anti-rotation, throws, chops, carries, swings, rotator cuff (exerciseAthletic.ts)
  ...ATHLETIC_BUILDERS,
  // LIBRARY-ANATOMY-2: lunges sideways, single-leg hinges, trunk, planks, conditioning, drills, jumps, rope, crawls (exerciseBody.ts)
  ...BODY_BUILDERS,
  // LIBRARY-ANATOMY-2: on a box, a bench, a bar, a pad (exerciseProps.ts; the stage draws the prop)
  ...PROP_BUILDERS,
  ...VARIANT_BUILDERS,
  // DEMO-LOOPS (2026-10-27): the Quick Screen's checks and the daily drills (exerciseDrills.ts)
  ...DRILL_BUILDERS,
  // DEMO-LOOPS: the signature programs' exercises (exerciseSignature.ts)
  ...SIGNATURE_BUILDERS,
];
/** Build one exercise loop by name (authored/index.ts registers each name through this). */
export function buildExerciseClip(name: string, scene: Scene, sk: Skeleton): AnimationGroup | null {
  return EXERCISE_BUILDERS.find(([n]) => n === name)?.[1](scene, sk) ?? null;
}
export const EXERCISE_CLIPS: readonly string[] = EXERCISE_BUILDERS.map(([n]) => n);
