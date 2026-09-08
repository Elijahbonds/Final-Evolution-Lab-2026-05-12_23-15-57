// Karate fills: hit react, knockdown. (Strikes alias to real GLB clips —
// jab/hook/roundhouse/uppercut — via clipAliases.)
// RE-AUTHORED as pose targets (ship pass 3, rung 1): degrees about the
// parent's bind axes, hands as world-axis metres from the root, fitted by the
// two-bone solver so the fills play on any body that passes Gate 0. The old
// Euler arm keys rotated about X — on this rig the arm's own axis — so the
// guard never actually came up.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip } from '../poseClip';
type V3 = [number, number, number];

const GUARD = { Left: [-0.18, 1.32, 0.30] as V3, Right: [0.16, 1.28, 0.24] as V3 };   // fists up in front of the chin

export function buildHitReact(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'karate_hit_react', 0.3, [
    { t: 0,   bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],    Neck: [0, 0, 0] },    hands: GUARD },
    { t: 0.1, bones: { Hips: [0, 6, 0], Spine: [-14, 8, 4],  Neck: [-12, 10, 0] }, hands: { Left: [-0.24, 1.36, 0.22], Right: [0.22, 1.30, 0.14] } },   // head snaps back, guard opens
    { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],    Neck: [0, 0, 0] },    hands: GUARD },
  ]);
}

export function buildKnockdown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'karate_knockdown', 0.7, [
    { t: 0,   bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],     Neck: [0, 0, 0],   LeftUpLeg: [-12, 0, 4],  RightUpLeg: [-12, 0, -4] },  hands: GUARD, hipsY: 0 },
    { t: 0.3, bones: { Hips: [0, 0, 0], Spine: [-40, 10, 8],  Neck: [-18, 0, 0], LeftUpLeg: [-20, 0, 8],  RightUpLeg: [-16, 0, -6] },  hands: { Left: [-0.40, 1.30, -0.10], Right: [0.42, 1.28, -0.12] }, hipsY: -0.30 },   // arms fly out and back
    { t: 0.7, bones: { Hips: [0, 0, 0], Spine: [-85, 12, 10], Neck: [-10, 0, 0], LeftUpLeg: [-35, 0, 12], RightUpLeg: [-25, 0, -10] }, hands: { Left: [-0.55, 0.30, -0.35], Right: [0.55, 0.30, -0.40] }, poles: { Left: [-0.3, 0.8, -0.4], Right: [0.3, 0.8, -0.4] }, hipsY: -0.9 },   // on the floor, arms out
  ]);
}

/** The GUARD STEP — a fighter's loco (MODE-STICK-FACE family, 2026-09-07). Every combat mode moved the fighter on the
 *  shared 'run' (arms pumping at the hips: a jogger, not a fighter). This keeps the fists at the chin (GUARD — the same
 *  targets the hit react returns to) over a short stepping cadence, so closing, circling and retreating all read as a
 *  fighter who is READY. Thigh ±26°, knee 12 + 14: a step, not a sprint. */
export function buildGuardStep(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.6, N = 8; const keys = [];
  for (let k = 0; k <= N; k++) {
    const phi = (2 * Math.PI * k) / N, s = Math.sin(phi);
    const kneeL = 12 + 14 * (1 - Math.cos(phi)), kneeR = 12 + 14 * (1 - Math.cos(phi + Math.PI));
    keys.push({
      t: (T * k) / N,
      bones: {
        Hips: [0, 4 * s, 0] as [number, number, number], Spine: [4, 0, 0] as [number, number, number],
        LeftUpLeg: [-26 * s, 0, 4] as [number, number, number], RightUpLeg: [26 * s, 0, -4] as [number, number, number],
        LeftLeg: [kneeL, 0, 0] as [number, number, number], RightLeg: [kneeR, 0, 0] as [number, number, number],
        LeftFoot: [-kneeL * 0.4 + 8 * s, 0, 0] as [number, number, number], RightFoot: [-kneeR * 0.4 - 8 * s, 0, 0] as [number, number, number],
      },
      hands: { Left: [GUARD.Left[0], GUARD.Left[1] + 0.02 * Math.abs(s), GUARD.Left[2]] as V3, Right: [GUARD.Right[0], GUARD.Right[1] + 0.02 * Math.abs(s), GUARD.Right[2]] as V3 },
    });
  }
  return buildPoseClip(scene, sk, 'karate_guard_step', T, keys);
}

// ── ANIM-READABILITY (combat, 2026-09-07): the guard verbs and the floor ───────────────────────────────────────────────
// The block was the stance clip at 1.6× (the alias table) — pressing GUARD changed nothing on screen. A guard has to READ:
// a high, tight guard with the chin down, a shove back when a hit lands on it, a flick when a parry lands. The knockdown
// ended on the floor and the stance then popped the body upright in a 0.12 s fade: the floor is now a HELD loop and the
// rise is its own clip (the knockdown's keys in reverse), so a guard break reads knock down → floor → get up.
const HIGH_GUARD = { Left: [-0.12, 1.46, 0.22] as V3, Right: [0.12, 1.43, 0.20] as V3 };   // fists in front of the face, elbows in
const BLOCK_BONES = { Hips: [0, 0, 0] as V3, Spine: [8, 0, 0] as V3, Neck: [10, 0, 0] as V3, LeftLeg: [8, 0, 0] as V3, RightLeg: [8, 0, 0] as V3 };

/** The BLOCK — a HOLD loop (starts IN the pose, breathes a hair, returns): the crossfade is the way in. */
export function buildBlockHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.9;
  const breathe = (d: number) => ({ Left: [HIGH_GUARD.Left[0], HIGH_GUARD.Left[1] + d, HIGH_GUARD.Left[2]] as V3, Right: [HIGH_GUARD.Right[0], HIGH_GUARD.Right[1] + d, HIGH_GUARD.Right[2]] as V3 });
  return buildPoseClip(scene, sk, 'karate_block', T, [
    { t: 0,     bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
    { t: T / 2, bones: { ...BLOCK_BONES, Spine: [9, 0, 0] }, hands: breathe(0.012), hipsY: -0.04 },
    { t: T,     bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
  ]);
}

/** A hit LANDS ON the guard: the guard is shoved back into the chin and the body gives, then resets. One-shot. */
export function buildGuardImpact(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'karate_guard_impact', 0.24, [
    { t: 0,    bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
    { t: 0.07, bones: { ...BLOCK_BONES, Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [14, 0, 0] }, hands: { Left: [-0.10, 1.42, 0.10], Right: [0.10, 1.40, 0.08] }, hipsY: -0.07 },
    { t: 0.24, bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
  ]);
}

/** The PARRY — the lead hand flicks the strike aside and snaps back to the high guard. One-shot. */
export function buildParry(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'karate_parry', 0.3, [
    { t: 0,   bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
    { t: 0.1, bones: { ...BLOCK_BONES, Spine: [2, 14, 0] }, hands: { Left: HIGH_GUARD.Left, Right: [0.26, 1.34, 0.50] }, hipsY: -0.04 },
    { t: 0.3, bones: BLOCK_BONES, hands: HIGH_GUARD, hipsY: -0.03 },
  ]);
}

/** The knockdown's floor key — the HELD loop a downed fighter stays in (a breath in the chest), and the get-up's start. */
const FLOOR_KEY = {
  bones: { Hips: [0, 0, 0] as V3, Spine: [-85, 12, 10] as V3, Neck: [-10, 0, 0] as V3, LeftUpLeg: [-35, 0, 12] as V3, RightUpLeg: [-25, 0, -10] as V3 },
  hands: { Left: [-0.55, 0.30, -0.35] as V3, Right: [0.55, 0.30, -0.40] as V3 },
  poles: { Left: [-0.3, 0.8, -0.4] as V3, Right: [0.3, 0.8, -0.4] as V3 },
  hipsY: -0.9,
};
export function buildFloorHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.4;
  return buildPoseClip(scene, sk, 'karate_floor_hold', T, [
    { t: 0, ...FLOOR_KEY },
    { t: T / 2, ...FLOOR_KEY, bones: { ...FLOOR_KEY.bones, Spine: [-83, 12, 10], Neck: [-6, 0, 0] } },
    { t: T, ...FLOOR_KEY },
  ]);
}

/** The GET-UP — the knockdown in reverse: floor → a sit → the stance. One-shot. */
export function buildGetUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'karate_get_up', 0.45, [
    { t: 0, ...FLOOR_KEY },
    { t: 0.22, bones: { Hips: [0, 0, 0], Spine: [-40, 10, 8], Neck: [-18, 0, 0], LeftUpLeg: [-20, 0, 8], RightUpLeg: [-16, 0, -6] }, hands: { Left: [-0.40, 1.30, -0.10], Right: [0.42, 1.28, -0.12] }, hipsY: -0.30 },
    { t: 0.45, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-12, 0, 4], RightUpLeg: [-12, 0, -4] }, hands: GUARD, hipsY: 0 },
  ]);
}

/** The WIND-UP (ANIM-READABILITY creative, 2026-09-07 — the carnival COUNTER STRIKE rival's telegraph). The rival used
 *  to announce the punch with the dunk CHARGE crouch (a basketball gather: hips down, arms swung back). A fighter loads a
 *  punch: the rear fist chambered back at the ribs, the lead guard still up, weight on the back leg, the shoulder turned.
 *  A HOLD loop — the crossfade is the way in — so the player has a clean silhouette to read the window from. */
export function buildWindupHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  const LOAD = { Left: [-0.20, 1.34, 0.30] as V3, Right: [0.30, 1.10, -0.28] as V3 };   // lead guard up, rear fist chambered back
  const LOAD_POLES = { Left: [-0.7, -0.2, -0.5] as V3, Right: [0.9, -0.3, -0.5] as V3 };
  const BONES = { Hips: [0, 22, 0] as V3, Spine: [6, 14, 4] as V3, Neck: [4, -12, 0] as V3, LeftUpLeg: [-8, 0, 6] as V3, RightUpLeg: [-18, 0, -6] as V3, RightLeg: [22, 0, 0] as V3 };
  return buildPoseClip(scene, sk, 'karate_windup_hold', T, [
    { t: 0, bones: BONES, hands: LOAD, poles: LOAD_POLES, hipsY: -0.05 },
    { t: T / 2, bones: { ...BONES, Spine: [7, 16, 4] }, hands: { Left: LOAD.Left, Right: [0.31, 1.08, -0.31] }, poles: LOAD_POLES, hipsY: -0.06 },
    { t: T, bones: BONES, hands: LOAD, poles: LOAD_POLES, hipsY: -0.05 },
  ]);
}
