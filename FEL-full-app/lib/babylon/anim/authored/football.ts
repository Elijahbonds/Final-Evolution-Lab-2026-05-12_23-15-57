// Football fills: jukes L/R, spin move, tackled fall.
// RE-AUTHORED as pose targets (ship pass 3, rung 1): degrees about the parent's
// bind axes, hands as world-axis metres from the root, fitted by the two-bone
// solver so the fills play on any body that passes Gate 0. The old Euler arm
// keys rotated about X — the arm's own axis on this rig — so the ball-carry arm
// never actually tucked.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

const CARRY = { Right: [0.20, 1.12, 0.22] as V3, Left: [-0.28, 1.00, 0.18] as V3 };   // ball tucked high on the right, off arm ready to stiff-arm

export function buildJuke(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'right' ? 1 : -1;
  const plant: Record<string, Deg3> = dir === 'right' ? { LeftUpLeg: [-8, 0, -6], RightUpLeg: [-70, 0, -6], RightLeg: [60, 0, 0] } : { RightUpLeg: [-8, 0, 6], LeftUpLeg: [-70, 0, 6], LeftLeg: [60, 0, 0] };
  return buildPoseClip(scene, sk, `football_juke_${dir}`, 0.4, [
    { t: 0,    bones: { Hips: [0, 0, 0],           Spine: [4, 0, 0],             LeftUpLeg: [-14, 0, 0], RightUpLeg: [-14, 0, 0] }, hands: CARRY },
    { t: 0.15, bones: { Hips: [0, 22 * s, 10 * s], Spine: [10, 18 * s, 8 * s],   ...plant },                                       hands: { Right: [0.22, 1.10, 0.20], Left: [-0.34 - 0.1 * s, 1.05, 0.30] } },   // knee up, off arm out
    { t: 0.4,  bones: { Hips: [0, 0, 0],           Spine: [4, 0, 0],             LeftUpLeg: [-14, 0, 0], RightUpLeg: [-14, 0, 0] }, hands: CARRY },
  ]);
}

export function buildSpinMove(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // the hips turn a full circle; the hands stay tucked so they ride round with the body
  const k = (t: number, yaw: number, spine: V3) => ({ t, bones: { Hips: [0, yaw, 0] as V3, Spine: spine } });
  return buildPoseClip(scene, sk, 'football_spin_move', 0.55, [
    { ...k(0, 0, [8, 0, 0]),       hands: CARRY },
    k(0.18, 130, [14, 0, 6]),
    k(0.36, 260, [14, 0, 6]),
    { ...k(0.55, 360, [8, 0, 0]),  hands: CARRY },
  ]);
}

export function buildTackledFall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'football_tackled_fall', 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],     Neck: [0, 0, 0],   LeftUpLeg: [-14, 0, 4],  RightUpLeg: [-14, 0, -4] }, hands: CARRY, hipsY: 0 },
    // the hit: hands BRACE forward and low. SHARED-ANIM-BUS (2026-09-14): this key threw both wrists out to shoulder height
    // ([±0.40–0.45, 1.25–1.30, behind the root]) — a T for a frame at the moment of contact, and on the one-mesh scan body
    // the jacket stretched across the chest into the "purple melt" the eye caught mid-play.
    // LIE THE PELVIS, NOT THE SPINE (rig sweep, 2026-09-16). Both the hit and the landing held
    // `Hips: [0,0,0]` and bent only the SPINE, which is a backbend rather than a body going
    // down — so the legs kept hanging from an upright hip socket while hipsY drove them into
    // the turf. Measured on a fresh rig: the lowest ankle reached -0.691 with the hips at
    // 0.123, and nothing clamps it because football does not foot-plant. Same fault, same
    // shape, as the karate floor key.
    { t: 0.25, bones: { Hips: [-26, 0, 4], Spine: [-12, 0, 10],  Neck: [-6, 0, 0], LeftUpLeg: [-26, 0, 8],  RightUpLeg: [-22, 0, -6], LeftLeg: [44, 0, 0], RightLeg: [48, 0, 0] }, hands: { Right: [0.30, 1.02, 0.30], Left: [-0.34, 1.00, 0.30] }, hipsY: -0.10 },
    { t: 0.6,  bones: { Hips: [-74, 0, 8], Spine: [-8, 0, 14],  Neck: [14, 0, 0], LeftUpLeg: [-18, 0, 10], RightUpLeg: [-12, 0, -8], LeftLeg: [38, 0, 0], RightLeg: [32, 0, 0] }, hands: { Right: [0.55, 0.35, -0.40], Left: [-0.55, 0.35, -0.35] }, poles: { Left: [-0.3, 0.8, -0.4], Right: [0.3, 0.8, -0.4] }, hipsY: -0.74 },
  ]);
}

/** The CARRY run — the loco the rush plays between its jukes (MODE-STICK-FACE family, 2026-09-07). The shared 'run'
 *  pumped both arms with no ball; a carrier keeps the ball tucked high on the right (CARRY.Right — the same target the
 *  jukes and the spin hold, so a move flows out of the run and back) and pumps the OFF arm against its own leg. The
 *  legs are the base run's cadence (thigh ±42°, knee 18 + 22). */
export function buildCarryRun(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.6, N = 8; const keys = [];
  for (let k = 0; k <= N; k++) {
    const phi = (2 * Math.PI * k) / N, s = Math.sin(phi);
    const kneeL = 18 + 22 * (1 - Math.cos(phi)), kneeR = 18 + 22 * (1 - Math.cos(phi + Math.PI));
    keys.push({
      t: (T * k) / N,
      bones: {
        Hips: [0, 5 * s, 0] as Deg3, Spine: [8, 0, 3 * s] as Deg3, Neck: [-4, 0, 0] as Deg3,
        LeftUpLeg: [-42 * s, 0, 0] as Deg3, RightUpLeg: [42 * s, 0, 0] as Deg3,
        LeftLeg: [kneeL, 0, 0] as Deg3, RightLeg: [kneeR, 0, 0] as Deg3,
        LeftFoot: [-kneeL * 0.4 + 12.6 * s, 0, 0] as Deg3, RightFoot: [-kneeR * 0.4 - 12.6 * s, 0, 0] as Deg3,
      },
      // the left thigh leads when s > 0, so the left hand goes BACK (each arm against its own leg)
      hands: { Right: CARRY.Right, Left: [-0.30, 0.92 + 0.08 * Math.abs(s), 0.12 - 0.34 * s] as V3 },
      poles: { Right: [0.6, -0.1, -0.5] as V3, Left: [-0.7, -0.2, -0.5] as V3 },
    });
  }
  return buildPoseClip(scene, sk, 'football_carry_run', T, keys);
}

/**
 * The TOUCHDOWN SPIKE (SHARED-ANIM-BUS, 2026-09-14). The football tree's celebrate asked for `football_touchdown_spike`,
 * which only ever existed as an alias onto the karate `uppercut` — a boxer's rising punch as the score beat, both fists
 * up in front of the face, and on the scan body the jacket bunched into a purple blob. A spike is the ball arm cocking
 * up by the ear, then driving the ball into the turf in front; the off arm pumps, bent, at chest height. Nothing locks
 * out wide at shoulder height (LocoBus ARM_LIMITS.celebrate).
 */
export function buildTouchdownSpike(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (k: number): Record<string, Deg3> => ({ LeftUpLeg: [-14 - 10 * k, 0, 4], RightUpLeg: [-10, 0, -4], LeftLeg: [16 + 14 * k, 0, 0], RightLeg: [12, 0, 0] });
  return buildPoseClip(scene, sk, 'football_td_spike', 1.0, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [4, 0, 0],    Neck: [-4, 0, 0], ...legs(0) }, hands: CARRY, hipsY: 0 },
    // cock: ball up by the right ear, chest opens
    { t: 0.22, bones: { Hips: [0, -10, 0], Spine: [-8, -14, 0], Neck: [-6, 0, 0], ...legs(0.3) }, hands: { Right: [0.24, 1.46, -0.02], Left: [-0.24, 1.08, 0.24] }, poles: { Right: [0.8, -0.3, -0.4] }, hipsY: 0.01 },
    // SPIKE: the ball arm drives down into the turf in front, the chest folds over it
    { t: 0.42, bones: { Hips: [0, 12, 0],  Spine: [30, 12, 0],  Neck: [-12, 0, 0], ...legs(1) }, hands: { Right: [0.22, 0.62, 0.42], Left: [-0.26, 1.02, 0.18] }, poles: { Right: [0.7, 0.2, -0.3] }, hipsY: -0.12 },
    // the pump: chest back up, off fist bent at the chest, ball hand low
    { t: 0.7,  bones: { Hips: [0, 0, 0],   Spine: [-6, 0, 0],   Neck: [-8, 0, 0], ...legs(0.4) }, hands: { Right: [0.26, 0.92, 0.18], Left: [-0.20, 1.26, 0.22] }, poles: { Left: [-0.7, -0.6, -0.2] }, hipsY: -0.02 },
    { t: 1.0,  bones: { Hips: [0, 0, 0],   Spine: [2, 0, 0],    Neck: [-4, 0, 0], ...legs(0) }, hands: { Right: [0.24, 0.96, 0.14], Left: [-0.22, 1.02, 0.12] }, hipsY: 0 },
  ]);
}
