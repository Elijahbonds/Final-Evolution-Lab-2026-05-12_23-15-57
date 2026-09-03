// Soccer (Phase 3 clips, ship pass 2026-09-03). The penalty strike was the
// karate high kick and the keeper dove with the jumpshot (clipAliases).
//
//   soccer_kick_shoot — plant, back-swing, strike through the ball, follow high
//   keeper_set        — low, wide, hands at knee height (loop)
//   keeper_dive       — set → full stretch to the right (mirror by scaling x)
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}
export const SOCCER_CLIPS = ['soccer_kick_shoot', 'keeper_set', 'keeper_dive'] as const;

/** Right-footed strike. Legs carry it; the arms counterbalance. */
export function buildSoccerKick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'soccer_kick_shoot', 0.7, {
    Hips: [[0, eulerQ(0, 10, 0)], [0.25, eulerQ(0, 20, 0)], [0.45, eulerQ(0, -15, 0)], [0.7, eulerQ(0, -25, 0)]],
    Spine: [[0, eulerQ(6, 0, 0)], [0.25, eulerQ(-14, 10, 0)], [0.45, eulerQ(18, -10, 0)], [0.7, eulerQ(10, -15, 0)]],
    // plant leg: slightly bent, holds
    LeftUpLeg: [[0, eulerQ(-12, 0, 8)], [0.7, eulerQ(-16, 0, 10)]],
    LeftLeg: [[0, eulerQ(18, 0, 0)], [0.7, eulerQ(22, 0, 0)]],
    // striking leg: back-swing (thigh back, knee folded) → through the ball (thigh forward, knee straight) → follow high
    RightUpLeg: [[0, eulerQ(-6, 0, -6)], [0.25, eulerQ(38, 0, -8)], [0.45, eulerQ(-70, 0, -6)], [0.7, eulerQ(-85, 0, -4)]],
    RightLeg: [[0, eulerQ(10, 0, 0)], [0.25, eulerQ(75, 0, 0)], [0.45, eulerQ(8, 0, 0)], [0.7, eulerQ(4, 0, 0)]],
    // arms: left arm sweeps forward for balance, right arm back
    // at the strike, solved under hips −15 / spine 18,−10: left hand out front (0.07, 1.32, 0.38), right hand back (0.42, 1.21, −0.20)
    LeftArm: [[0, withOffset(la, 0, -20, -10)], [0.25, withOffset(la, 0, -40, -20)], [0.45, withOffset(la, 0, -150, -30)], [0.7, withOffset(la, 0, -80, -40)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [0.45, withOffset(lf, 0, 100, 0)], [0.7, withOffset(lf, 0, 40, 0)]],
    RightArm: [[0, withOffset(ra, 0, -20, 10)], [0.25, withOffset(ra, 0, -70, 40)], [0.45, withOffset(ra, 0, -50, -40)], [0.7, withOffset(ra, 0, 20, 30)]],
    RightForeArm: [[0, withOffset(rf, 0, 0, 0)], [0.45, withOffset(rf, 0, 100, 0)], [0.7, withOffset(rf, 0, 40, 0)]],
  }, [[0, -0.02], [0.25, -0.05], [0.45, -0.02], [0.7, 0.0]]);
}

export function buildKeeperSet(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  const D = 1.0;
  return buildQuatClip(scene, sk, 'keeper_set', D, {
    Hips: [[0, eulerQ(0, 0, 0)], [D, eulerQ(0, 0, 0)]],
    Spine: [[0, eulerQ(30, 0, 0)], [D / 2, eulerQ(32, 0, 0)], [D, eulerQ(30, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-36, 0, 22)], [D / 2, eulerQ(-40, 0, 22)], [D, eulerQ(-36, 0, 22)]],
    RightUpLeg: [[0, eulerQ(-36, 0, -22)], [D / 2, eulerQ(-40, 0, -22)], [D, eulerQ(-36, 0, -22)]],
    LeftLeg: [[0, eulerQ(50, 0, 0)], [D / 2, eulerQ(56, 0, 0)], [D, eulerQ(50, 0, 0)]],
    RightLeg: [[0, eulerQ(50, 0, 0)], [D / 2, eulerQ(56, 0, 0)], [D, eulerQ(50, 0, 0)]],
    // solved under spine 30: hands wide at knee height (±0.31, 0.91, 0.30)
    RightArm: [[0, withOffset(ra, 0, -140, -180)], [D, withOffset(ra, 0, -140, -180)]],
    LeftArm: [[0, withOffset(la, 0, 140, -180)], [D, withOffset(la, 0, 140, -180)]],
  }, [[0, -0.14], [D / 2, -0.17], [D, -0.14]]);
}

/** Dive to the keeper's right: full stretch, both hands out past the shoulder. */
export function buildKeeperDive(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'keeper_dive', 0.6, {
    // the body tips to the right (roll) and folds toward the ball
    Hips: [[0, eulerQ(0, 0, 0)], [0.25, eulerQ(0, 0, 25)], [0.6, eulerQ(0, 0, 55)]],
    Spine: [[0, eulerQ(30, 0, 0)], [0.25, eulerQ(15, 0, 20)], [0.6, eulerQ(5, 0, 30)]],
    LeftUpLeg: [[0, eulerQ(-36, 0, 22)], [0.25, eulerQ(-60, 0, 10)], [0.6, eulerQ(-20, 0, 0)]],
    RightUpLeg: [[0, eulerQ(-36, 0, -22)], [0.25, eulerQ(-10, 0, -10)], [0.6, eulerQ(0, 0, -6)]],
    LeftLeg: [[0, eulerQ(50, 0, 0)], [0.25, eulerQ(60, 0, 0)], [0.6, eulerQ(10, 0, 0)]],
    RightLeg: [[0, eulerQ(50, 0, 0)], [0.25, eulerQ(10, 0, 0)], [0.6, eulerQ(4, 0, 0)]],
    // both arms reach right: (0.60, 1.39, 0.22) and (0.33, 1.55, 0.13)
    // solved under hips roll 55 / spine 5,0,30: (0.62, 1.37, 0.21) and (0.38, 1.56, 0.26)
    RightArm: [[0, withOffset(ra, 0, -140, -180)], [0.6, withOffset(ra, 0, -30, 130)]],
    RightForeArm: [[0, withOffset(rf, 0, 0, 0)], [0.6, withOffset(rf, 0, 0, 0)]],
    LeftArm: [[0, withOffset(la, 0, 140, -180)], [0.6, withOffset(la, 0, -150, 90)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [0.6, withOffset(lf, 0, 70, 0)]],
  }, [[0, -0.14], [0.25, -0.10], [0.6, -0.30]]);
}
