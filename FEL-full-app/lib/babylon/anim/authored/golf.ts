// Golf (Phase 3 clips, ship pass 2026-09-03). The address was the karate guard
// and the swing was the hook (clipAliases). Built like the baseball suite:
// arms ride the measured arms-down rest; hands solved on the forge rig with
// scripts/avatar/_arm-solve.mts UNDER the torso keys they play with.
//
//   golf_address_idle — bent at the waist, hands together low in front (loop)
//   golf_swing_full   — takeaway to the top over the right shoulder, down
//                       through the ball, finish high over the left shoulder
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}
export const GOLF_CLIPS = ['golf_address_idle', 'golf_swing_full'] as const;

/** Address: spine 32° forward, knees soft, both hands together at the grip. */
export function buildGolfAddress(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  const D = 1.4;
  return buildQuatClip(scene, sk, 'golf_address_idle', D, {
    Hips: [[0, eulerQ(0, 0, 0)], [D, eulerQ(0, 0, 0)]],
    Spine: [[0, eulerQ(32, 0, 0)], [D / 2, eulerQ(33, 0, 0)], [D, eulerQ(32, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-14, 0, 8)], [D, eulerQ(-14, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-14, 0, -8)], [D, eulerQ(-14, 0, -8)]],
    LeftLeg: [[0, eulerQ(20, 0, 0)], [D, eulerQ(20, 0, 0)]],
    RightLeg: [[0, eulerQ(20, 0, 0)], [D, eulerQ(20, 0, 0)]],
    // solved under spine 32: both hands at (±0.03, 0.90, 0.29)
    RightArm: [[0, withOffset(ra, 0, 60, 30)], [D, withOffset(ra, 0, 60, 30)]],
    LeftArm: [[0, withOffset(la, 0, -60, -30)], [D, withOffset(la, 0, -60, -30)]],
  }, [[0, -0.04], [D / 2, -0.045], [D, -0.04]]);
}

/** The full swing: address → top → impact → finish. */
export function buildGolfSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'golf_swing_full', 0.9, {
    // hips turn away then clear hard through impact; spine stays bent at the ball
    Hips: [[0, eulerQ(0, 0, 0)], [0.35, eulerQ(0, 40, 0)], [0.55, eulerQ(0, -20, 0)], [0.9, eulerQ(0, -80, 0)]],
    Spine: [[0, eulerQ(32, 0, 0)], [0.35, eulerQ(25, 35, 0)], [0.55, eulerQ(30, -10, 0)], [0.9, eulerQ(5, -70, 0)]],
    LeftUpLeg: [[0, eulerQ(-14, 0, 8)], [0.9, eulerQ(-10, 0, 6)]],
    RightUpLeg: [[0, eulerQ(-14, 0, -8)], [0.9, eulerQ(-22, 0, -4)]],
    // hands: grip low (±0.03, 0.90, 0.29) → top over the right shoulder (0.38, 1.77, −0.16)
    // → back through the ball → finish high left (−0.30, 1.68, 0.04)
    // solved UNDER the torso keys (hips 40 / spine 25,35 at the top; −20 / 30,−10 at impact; −80 / 5,−70 at the finish)
    RightArm: [[0, withOffset(ra, 0, 60, 30)], [0.35, withOffset(ra, 0, -90, 20)], [0.55, withOffset(ra, 0, 60, 40)], [0.9, withOffset(ra, 0, -60, -40)]],
    LeftArm: [[0, withOffset(la, 0, -60, -30)], [0.35, withOffset(la, 0, -80, -170)], [0.55, withOffset(la, 0, -50, -20)], [0.9, withOffset(la, 0, 130, -40)]],
    RightForeArm: [[0, withOffset(rf, 0, 0, 0)], [0.35, withOffset(rf, 0, 0, 0)], [0.55, withOffset(rf, 0, 0, 0)], [0.9, withOffset(rf, 0, -100, 0)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [0.9, withOffset(lf, 0, 0, 0)]],
  }, [[0, -0.04], [0.55, -0.06], [0.9, 0.0]]);
}
