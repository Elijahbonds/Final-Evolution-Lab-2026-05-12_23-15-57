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
