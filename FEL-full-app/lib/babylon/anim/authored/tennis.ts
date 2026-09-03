// Tennis (Phase 3 clips, ship pass 2026-09-03). The net sport reused the
// jumpshot as its swing. Rig-solved hands, arms on the measured rest.
//
//   tennis_ready — split-step bounce, racket hand front-right (loop)
//   tennis_swing — forehand: take-back, contact out front, wrap over the left shoulder
//   tennis_serve — trophy, contact overhead, follow through low left
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}
export const TENNIS_CLIPS = ['tennis_ready', 'tennis_swing', 'tennis_serve'] as const;

export function buildTennisReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  const D = 0.8;
  return buildQuatClip(scene, sk, 'tennis_ready', D, {
    Hips: [[0, eulerQ(0, 0, 0)], [D, eulerQ(0, 0, 0)]],
    Spine: [[0, eulerQ(14, 0, 0)], [D / 2, eulerQ(16, 0, 0)], [D, eulerQ(14, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-22, 0, 14)], [D / 2, eulerQ(-26, 0, 14)], [D, eulerQ(-22, 0, 14)]],
    RightUpLeg: [[0, eulerQ(-22, 0, -14)], [D / 2, eulerQ(-26, 0, -14)], [D, eulerQ(-22, 0, -14)]],
    LeftLeg: [[0, eulerQ(34, 0, 0)], [D / 2, eulerQ(40, 0, 0)], [D, eulerQ(34, 0, 0)]],
    RightLeg: [[0, eulerQ(34, 0, 0)], [D / 2, eulerQ(40, 0, 0)], [D, eulerQ(34, 0, 0)]],
    // racket hand (0.32, 1.03, 0.27); free hand on the throat (0.06, 1.09, 0.29)
    // solved under spine 14: racket hand (0.31, 0.99, 0.30), free hand (0.05, 1.04, 0.31)
    RightArm: [[0, withOffset(ra, 0, 30, 0)], [D, withOffset(ra, 0, 30, 0)]],
    RightForeArm: [[0, withOffset(rf, 0, 40, 0)], [D, withOffset(rf, 0, 40, 0)]],
    LeftArm: [[0, withOffset(la, 0, -70, -40)], [D, withOffset(la, 0, -70, -40)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [D, withOffset(lf, 0, 0, 0)]],
  }, [[0, -0.06], [D / 2, -0.09], [D, -0.06]]);
}

/** Forehand. */
export function buildTennisSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !rf) return null;
  return buildQuatClip(scene, sk, 'tennis_swing', 0.6, {
    Hips: [[0, eulerQ(0, 35, 0)], [0.3, eulerQ(0, -10, 0)], [0.6, eulerQ(0, -45, 0)]],
    Spine: [[0, eulerQ(12, 25, 0)], [0.3, eulerQ(14, -10, 0)], [0.6, eulerQ(10, -35, 0)]],
    LeftUpLeg: [[0, eulerQ(-18, 0, 12)], [0.6, eulerQ(-12, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-24, 0, -12)], [0.6, eulerQ(-20, 0, -6)]],
    // take-back (0.40, 1.08, −0.29) → contact (0.39, 1.12, 0.35) → wrap (−0.27, 1.56, 0.14)
    // solved under the torso keys (hips 35 / spine 12,25 → −10 / 14,−10 → −45 / 10,−35)
    RightArm: [[0, withOffset(ra, 0, -40, 30)], [0.3, withOffset(ra, 0, -120, -180)], [0.6, withOffset(ra, 0, -150, 50)]],
    RightForeArm: [[0, withOffset(rf, 0, 0, 0)], [0.3, withOffset(rf, 0, 0, 0)], [0.6, withOffset(rf, 0, 70, 0)]],
    // the free arm points at the ball then tucks
    LeftArm: [[0, withOffset(la, 0, 170, -100)], [0.3, withOffset(la, 0, -70, -40)], [0.6, withOffset(la, 0, -30, -20)]],
  }, [[0, -0.06], [0.3, -0.07], [0.6, -0.03]]);
}

/** Serve. */
export function buildTennisServe(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'tennis_serve', 0.9, {
    Hips: [[0, eulerQ(0, 20, 0)], [0.4, eulerQ(0, 30, 0)], [0.6, eulerQ(0, -10, 0)], [0.9, eulerQ(0, -25, 0)]],
    Spine: [[0, eulerQ(0, 10, 0)], [0.4, eulerQ(-12, 20, 0)], [0.6, eulerQ(12, -10, 0)], [0.9, eulerQ(26, -20, 0)]],
    LeftUpLeg: [[0, eulerQ(-8, 0, 8)], [0.4, eulerQ(-20, 0, 8)], [0.9, eulerQ(-10, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-8, 0, -8)], [0.4, eulerQ(-20, 0, -8)], [0.9, eulerQ(-30, 0, -6)]],
    LeftLeg: [[0, eulerQ(10, 0, 0)], [0.4, eulerQ(34, 0, 0)], [0.9, eulerQ(10, 0, 0)]],
    RightLeg: [[0, eulerQ(10, 0, 0)], [0.4, eulerQ(34, 0, 0)], [0.9, eulerQ(20, 0, 0)]],
    // racket: trophy (0.30, 1.93, −0.22) → contact overhead (0.20, 1.99, 0.11) → down and left
    // solved under the torso keys (hips 30 / spine −12,20 → −10 / 12,−10 → −25 / 26,−20)
    RightArm: [[0, withOffset(ra, 0, -30, -20)], [0.4, withOffset(ra, 0, 20, -180)], [0.6, withOffset(ra, 0, 0, -170)], [0.9, withOffset(ra, 0, -160, 110)]],
    RightForeArm: [[0, withOffset(rf, 0, 0, 0)], [0.9, withOffset(rf, 0, 0, 0)]],
    // toss arm up (0.08, 1.72, 0.26), then down out of the way
    LeftArm: [[0, withOffset(la, 0, -60, -20)], [0.4, withOffset(la, 0, -160, -40)], [0.6, withOffset(la, 0, -40, -60)], [0.9, withOffset(la, 0, -20, -10)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [0.9, withOffset(lf, 0, 0, 0)]],
  }, [[0, -0.02], [0.4, -0.08], [0.6, 0.02], [0.9, -0.04]]);
}
