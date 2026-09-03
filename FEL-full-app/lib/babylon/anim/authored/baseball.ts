// Baseball packages (Phase 6, ship pass 2026-09-03). The derby's stance, swing
// and pitch were the karate guard, uppercut and jab (clipRegistry SPORT_CLIP)
// — the sign-off's "one arm action for every pitch" understated it. These are
// built like the basketball suite: arms ride the measured arms-down rest and
// every clip is proven on the forge rig by baseball.test.ts.
//
//   baseball_stance      — bat up by the back shoulder, knees loaded (loop)
//   baseball_swing       — hips lead, hands sweep through the zone, follow-through
//   baseball_pitch_over  — over-the-top: fastball and changeup (same look)
//   baseball_pitch_side  — three-quarter: the slider's arm slot
//
// withOffset(rest, x, y, z): y swings the arm forward (+ right / − left),
// z raises it toward the T (+ left / − right; ±162 overhead).

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}

export const BASEBALL_CLIPS = ['baseball_stance', 'baseball_swing', 'baseball_pitch_over', 'baseball_pitch_side'] as const;

/** Right-handed batter: hands together up by the back (right) shoulder. */
export function buildBatStance(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra) return null;
  const tracks: Record<string, [number, ReturnType<typeof eulerQ>][]> = {
    Hips: [[0, eulerQ(0, 18, 0)], [1.2, eulerQ(0, 18, 0)]],
    Spine: [[0, eulerQ(16, 14, 0)], [0.6, eulerQ(18, 14, 0)], [1.2, eulerQ(16, 14, 0)]],
    LeftUpLeg: [[0, eulerQ(-24, 0, 12)], [1.2, eulerQ(-24, 0, 12)]],
    RightUpLeg: [[0, eulerQ(-24, 0, -12)], [1.2, eulerQ(-24, 0, -12)]],
    LeftLeg: [[0, eulerQ(36, 0, 0)], [1.2, eulerQ(36, 0, 0)]],
    RightLeg: [[0, eulerQ(36, 0, 0)], [1.2, eulerQ(36, 0, 0)]],
    // both hands up and across to the right shoulder
    // solved on the rig (_arm-solve.mts): both hands at (0.30, 1.45, −0.25)
    LeftArm: [[0, withOffset(la, 0, 100, -60)], [1.2, withOffset(la, 0, 100, -60)]],
    RightArm: [[0, withOffset(ra, 0, -10, -40)], [1.2, withOffset(ra, 0, -10, -40)]],
  };
  if (rf) tracks.RightForeArm = [[0, withOffset(rf, 0, -100, 0)], [1.2, withOffset(rf, 0, -100, 0)]];
  void lf;
  return buildQuatClip(scene, sk, 'baseball_stance', 1.2, tracks, [[0, -0.05], [0.6, -0.06], [1.2, -0.05]]);
}

/** The swing: hips open first, hands come through the zone, full follow-through. */
export function buildBatSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'baseball_swing', 0.55, {
    Hips: [[0, eulerQ(0, 18, 0)], [0.12, eulerQ(0, -10, 0)], [0.3, eulerQ(0, -55, 0)], [0.55, eulerQ(0, -60, 0)]],
    Spine: [[0, eulerQ(16, 14, 0)], [0.18, eulerQ(12, -20, 0)], [0.3, eulerQ(8, -50, 0)], [0.55, eulerQ(6, -55, 0)]],
    LeftUpLeg: [[0, eulerQ(-24, 0, 12)], [0.3, eulerQ(-10, 0, 8)], [0.55, eulerQ(-12, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-24, 0, -12)], [0.3, eulerQ(-30, 0, -6)], [0.55, eulerQ(-30, 0, -6)]],
    // hands: loaded at the back shoulder → extended through the zone in front → wrapped high on the left
    // solved keys: stance → contact (0.10, 1.15, 0.55) → wrap (−0.35, 1.55, 0.10)
    // solved UNDER the torso keys (hips −55 / spine −50 at contact; −60 / −55 at the wrap)
    LeftArm: [[0, withOffset(la, 0, 100, -60)], [0.3, withOffset(la, 0, -170, 150)], [0.55, withOffset(la, 0, 130, -30)]],
    RightArm: [[0, withOffset(ra, 0, -10, -40)], [0.3, withOffset(ra, 0, 60, 90)], [0.55, withOffset(ra, 0, -50, 20)]],
    RightForeArm: [[0, withOffset(rf!, 0, -100, 0)], [0.3, withOffset(rf!, 0, 0, 0)], [0.55, withOffset(rf!, 0, -70, 0)]],
    LeftForeArm: [[0, withOffset(lf!, 0, 0, 0)], [0.3, withOffset(lf!, 0, 0, 0)], [0.55, withOffset(lf!, 0, -70, 0)]],
  }, [[0, -0.05], [0.2, -0.07], [0.55, -0.02]]);
}

/** Over-the-top delivery: the arm goes high behind, then whips over and forward. */
export function buildPitchOver(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !rf) return null;
  return buildQuatClip(scene, sk, 'baseball_pitch_over', 0.7, {
    Spine: [[0, eulerQ(6, 0, 0)], [0.25, eulerQ(-12, 20, 0)], [0.45, eulerQ(24, -25, 0)], [0.7, eulerQ(20, -20, 0)]],
    LeftUpLeg: [[0, eulerQ(-10, 0, 6)], [0.25, eulerQ(-80, 0, 8)], [0.45, eulerQ(-30, 0, 10)], [0.7, eulerQ(-20, 0, 10)]],
    LeftLeg: [[0, eulerQ(12, 0, 0)], [0.25, eulerQ(70, 0, 0)], [0.45, eulerQ(20, 0, 0)], [0.7, eulerQ(20, 0, 0)]],
    LeftArm: [[0, withOffset(la, 0, -20, 6)], [0.25, withOffset(la, 0, -70, 40)], [0.45, withOffset(la, 0, -20, 10)], [0.7, withOffset(la, 0, -10, 6)]],
    // the throwing arm: back and up → over the top (nearly overhead) → forward and down
    // solved keys: back (0.20, 1.25, −0.40) → top (0.25, 2.0, −0.05) → release (0.30, 1.50, 0.45)
    // solved under the spine keys: top (−12, 20) → release (24, −25)
    RightArm: [[0, withOffset(ra, 0, -10, -8)], [0.22, withOffset(ra, 0, 150, 170)], [0.42, withOffset(ra, 0, -10, -160)], [0.7, withOffset(ra, 0, 90, 10)]],
    RightForeArm: [[0, withOffset(rf!, 0, 0, 0)], [0.22, withOffset(rf!, 0, 70, 0)], [0.42, withOffset(rf!, 0, 0, 0)], [0.7, withOffset(rf!, 0, 100, 0)]],
  }, [[0, -0.02], [0.25, 0.02], [0.45, -0.08], [0.7, -0.06]]);
}

/** Three-quarter delivery (the slider): the same wind-up, a lower arm slot at release. */
export function buildPitchSide(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !rf) return null;
  return buildQuatClip(scene, sk, 'baseball_pitch_side', 0.7, {
    Spine: [[0, eulerQ(6, 0, 0)], [0.25, eulerQ(-8, 22, 0)], [0.45, eulerQ(22, -30, 6)], [0.7, eulerQ(18, -22, 4)]],
    LeftUpLeg: [[0, eulerQ(-10, 0, 6)], [0.25, eulerQ(-80, 0, 8)], [0.45, eulerQ(-30, 0, 10)], [0.7, eulerQ(-20, 0, 10)]],
    LeftLeg: [[0, eulerQ(12, 0, 0)], [0.25, eulerQ(70, 0, 0)], [0.45, eulerQ(20, 0, 0)], [0.7, eulerQ(20, 0, 0)]],
    LeftArm: [[0, withOffset(la, 0, -20, 6)], [0.25, withOffset(la, 0, -70, 40)], [0.45, withOffset(la, 0, -20, 10)], [0.7, withOffset(la, 0, -10, 6)]],
    // release from a three-quarter slot: hand at shoulder height, out to the side
    // solved keys: back (0.20, 1.25, −0.40) → side-top (0.55, 1.75, −0.10) → release (0.55, 1.40, 0.35)
    // solved under the spine keys: side-top (−8, 22) → release (22, −30, 6)
    RightArm: [[0, withOffset(ra, 0, -10, -8)], [0.22, withOffset(ra, 0, 150, 170)], [0.42, withOffset(ra, 0, 10, -120)], [0.7, withOffset(ra, 0, -40, -160)]],
    RightForeArm: [[0, withOffset(rf!, 0, 0, 0)], [0.22, withOffset(rf!, 0, 70, 0)], [0.42, withOffset(rf!, 0, -40, 0)], [0.7, withOffset(rf!, 0, 70, 0)]],
  }, [[0, -0.02], [0.25, 0.02], [0.45, -0.08], [0.7, -0.06]]);
}
