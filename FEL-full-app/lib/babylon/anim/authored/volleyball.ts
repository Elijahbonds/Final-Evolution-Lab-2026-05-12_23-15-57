// Volleyball (Phase 3 clips, ship pass 2026-09-03). The net sport reused the
// jumpshot for the spike. Rig-solved hands, arms on the measured rest.
//
//   volleyball_ready — low, hands together in front, weight bouncing (loop)
//   volleyball_spike — load with the hitting arm back, contact overhead, snap down
//   volleyball_block — both hands straight up over the net
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}
export const VOLLEYBALL_CLIPS = ['volleyball_ready', 'volleyball_spike', 'volleyball_block'] as const;

export function buildVolleyReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  const D = 0.9;
  return buildQuatClip(scene, sk, 'volleyball_ready', D, {
    Hips: [[0, eulerQ(0, 0, 0)], [D, eulerQ(0, 0, 0)]],
    Spine: [[0, eulerQ(22, 0, 0)], [D / 2, eulerQ(24, 0, 0)], [D, eulerQ(22, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-30, 0, 14)], [D / 2, eulerQ(-34, 0, 14)], [D, eulerQ(-30, 0, 14)]],
    RightUpLeg: [[0, eulerQ(-30, 0, -14)], [D / 2, eulerQ(-34, 0, -14)], [D, eulerQ(-30, 0, -14)]],
    LeftLeg: [[0, eulerQ(44, 0, 0)], [D / 2, eulerQ(50, 0, 0)], [D, eulerQ(44, 0, 0)]],
    RightLeg: [[0, eulerQ(44, 0, 0)], [D / 2, eulerQ(50, 0, 0)], [D, eulerQ(44, 0, 0)]],
    // solved under spine 22: hands (±0.11, 0.95, 0.34)
    RightArm: [[0, withOffset(ra, 0, 60, 20)], [D, withOffset(ra, 0, 60, 20)]],
    LeftArm: [[0, withOffset(la, 0, -60, -20)], [D, withOffset(la, 0, -60, -20)]],
  }, [[0, -0.10], [D / 2, -0.13], [D, -0.10]]);
}

export function buildVolleySpike(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), lf = r.get('LeftForeArm'), rf = r.get('RightForeArm');
  if (!la || !ra || !lf || !rf) return null;
  return buildQuatClip(scene, sk, 'volleyball_spike', 0.6, {
    Hips: [[0, eulerQ(0, 25, 0)], [0.3, eulerQ(0, -5, 0)], [0.6, eulerQ(0, -20, 0)]],
    Spine: [[0, eulerQ(-14, 20, 0)], [0.3, eulerQ(14, -5, 0)], [0.6, eulerQ(28, -15, 0)]],
    LeftUpLeg: [[0, eulerQ(-40, 0, 10)], [0.3, eulerQ(-20, 0, 8)], [0.6, eulerQ(-30, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-30, 0, -10)], [0.3, eulerQ(-20, 0, -8)], [0.6, eulerQ(-30, 0, -8)]],
    LeftLeg: [[0, eulerQ(50, 0, 0)], [0.3, eulerQ(20, 0, 0)], [0.6, eulerQ(40, 0, 0)]],
    RightLeg: [[0, eulerQ(50, 0, 0)], [0.3, eulerQ(20, 0, 0)], [0.6, eulerQ(40, 0, 0)]],
    // hitting arm: bow-and-arrow back (0.30, 1.93, −0.22) → contact overhead front (0.21, 1.97, 0.20) → snapped down
    // solved under the torso keys (hips 25 / spine −14,20 at the load; −5 / 14,−5 at contact)
    RightArm: [[0, withOffset(ra, 0, -170, -10)], [0.3, withOffset(ra, 0, -170, -20)], [0.6, withOffset(ra, 0, 60, 30)]],
    RightForeArm: [[0, withOffset(rf, 0, 40, 0)], [0.3, withOffset(rf, 0, 0, 0)], [0.6, withOffset(rf, 0, 0, 0)]],
    // guide arm up at the ball (0.11, 1.72, 0.24) then pulled in
    LeftArm: [[0, withOffset(la, 0, 40, -140)], [0.3, withOffset(la, 0, 140, -160)], [0.6, withOffset(la, 0, -40, -20)]],
    LeftForeArm: [[0, withOffset(lf, 0, 0, 0)], [0.3, withOffset(lf, 0, 100, 0)], [0.6, withOffset(lf, 0, 0, 0)]],
  }, [[0, -0.12], [0.3, 0.02], [0.6, -0.10]]);
}

export function buildVolleyBlock(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, 'volleyball_block', 0.5, {
    Hips: [[0, eulerQ(0, 0, 0)], [0.5, eulerQ(0, 0, 0)]],
    Spine: [[0, eulerQ(22, 0, 0)], [0.25, eulerQ(0, 0, 0)], [0.5, eulerQ(-4, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-30, 0, 14)], [0.25, eulerQ(-4, 0, 8)], [0.5, eulerQ(0, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-30, 0, -14)], [0.25, eulerQ(-4, 0, -8)], [0.5, eulerQ(0, 0, -8)]],
    LeftLeg: [[0, eulerQ(44, 0, 0)], [0.25, eulerQ(6, 0, 0)], [0.5, eulerQ(0, 0, 0)]],
    RightLeg: [[0, eulerQ(44, 0, 0)], [0.25, eulerQ(6, 0, 0)], [0.5, eulerQ(0, 0, 0)]],
    // both hands straight up over the net (±0.21, 1.97, 0.20)
    // solved under spine −4: (±0.22, 1.96, 0.18)
    RightArm: [[0, withOffset(ra, 0, 60, 20)], [0.25, withOffset(ra, 0, -30, -160)], [0.5, withOffset(ra, 0, -30, -160)]],
    LeftArm: [[0, withOffset(la, 0, -60, -20)], [0.25, withOffset(la, 0, 30, 160)], [0.5, withOffset(la, 0, 30, 160)]],
  }, [[0, -0.10], [0.25, 0.02], [0.5, 0.05]]);
}
