// Locomotion v2 — REPLACES the M24 file. Fixes the real cause of the
// "everything looks T-posed" complaint (see restPose.ts for the full
// finding): the M24 idle keyed the arms only ~8-10° off this rig's arms-out
// bind pose, so a standing character was visually indistinguishable from
// bind. Animation was never broken — the idle was.
//
// idle_stand and both strafes are now built on a MEASURED arms-down rest
// pose (solveArmsDown() empirically finds which axis/sign lowers the arm on
// the live rig — no sign guessing), with the same subtle breathing motion
// layered on top. jump_up / jump_land are unchanged from M24: their arm
// rotations are already large enough to read clearly.
//
// This one file makes every mode's default standing pose look right, since
// `idle_stand` is the base loop `neverBindPose()` falls back to everywhere.

import type { Scene, Skeleton, AnimationGroup, Quaternion } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose, type QuatKeys } from '../restPose';

/** Solved once per skeleton and reused by every clip in this module. */
const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}

export function buildIdleStand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const rest = restFor(sk);
  const la = rest.get('LeftArm'), ra = rest.get('RightArm');
  const lf = rest.get('LeftForeArm'), rf = rest.get('RightForeArm');

  // Fallback: if the rig didn't yield a solution, keep M24's behavior rather
  // than shipping a broken pose.
  if (!la || !ra) {
    return buildClip(scene, sk, 'idle_stand', 3.0, {
      Spine: [[0, 2, 0, 0], [1.5, 4.5, 0, 0], [3, 2, 0, 0]],
      Neck: [[0, 0, 0, 0], [1.5, 2, 3, 0], [3, 0, 0, 0]],
      LeftArm: [[0, 8, 0, 6], [1.5, 10, 0, 7], [3, 8, 0, 6]],
      RightArm: [[0, 8, 0, -6], [1.5, 10, 0, -7], [3, 8, 0, -6]],
    }, [[0, 0], [1.5, -0.012], [3, 0]]);
  }

  // breathing: a few degrees of arm sway + spine rise, around the rest pose
  const tracks: QuatKeys = {
    Spine: [[0, eulerQ(2, 0, 0)], [1.5, eulerQ(4.5, 0, 0)], [3, eulerQ(2, 0, 0)]],
    Neck: [[0, eulerQ(0, 0, 0)], [1.5, eulerQ(2, 3, 0)], [3, eulerQ(0, 0, 0)]],
    LeftArm: [[0, la], [1.5, withOffset(la, 0, 0, 3)], [3, la]],
    RightArm: [[0, ra], [1.5, withOffset(ra, 0, 0, -3)], [3, ra]],
  };
  const breathe = (q: Quaternion): [number, Quaternion][] => [[0, q], [1.5, withOffset(q, 4, 0, 0)], [3, q]];
  if (lf) tracks.LeftForeArm = breathe(lf);
  if (rf) tracks.RightForeArm = breathe(rf);
  return buildQuatClip(scene, sk, 'idle_stand', 3.0, tracks, [[0, 0], [1.5, -0.012], [3, 0]]);
}

export function buildStrafe(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const rest = restFor(sk);
  const la = rest.get('LeftArm'), ra = rest.get('RightArm');

  if (!la || !ra) {
    return buildClip(scene, sk, `strafe_${dir}`, 0.6, {
      Hips: [[0, 0, 0, 6 * s], [0.3, 0, 0, 10 * s], [0.6, 0, 0, 6 * s]],
      Spine: [[0, 4, 0, -4 * s], [0.3, 6, 0, -6 * s], [0.6, 4, 0, -4 * s]],
      LeftUpLeg: [[0, -12, 0, 8 * s], [0.3, -22, 0, 14 * s], [0.6, -12, 0, 8 * s]],
      RightUpLeg: [[0, -12, 0, 8 * s], [0.3, -4, 0, 2 * s], [0.6, -12, 0, 8 * s]],
      LeftArm: [[0, 12, 0, 8], [0.3, 18, 0, 12], [0.6, 12, 0, 8]],
      RightArm: [[0, 12, 0, -8], [0.3, 18, 0, -12], [0.6, 12, 0, -8]],
    });
  }

  // legs/hips keep M24's tuned Euler motion; arms ride the measured rest
  return buildQuatClip(scene, sk, `strafe_${dir}`, 0.6, {
    Hips: [[0, eulerQ(0, 0, 6 * s)], [0.3, eulerQ(0, 0, 10 * s)], [0.6, eulerQ(0, 0, 6 * s)]],
    Spine: [[0, eulerQ(4, 0, -4 * s)], [0.3, eulerQ(6, 0, -6 * s)], [0.6, eulerQ(4, 0, -4 * s)]],
    LeftUpLeg: [[0, eulerQ(-12, 0, 8 * s)], [0.3, eulerQ(-22, 0, 14 * s)], [0.6, eulerQ(-12, 0, 8 * s)]],
    RightUpLeg: [[0, eulerQ(-12, 0, 8 * s)], [0.3, eulerQ(-4, 0, 2 * s)], [0.6, eulerQ(-12, 0, 8 * s)]],
    LeftArm: [[0, withOffset(la, 8, 0, 0)], [0.3, withOffset(la, 14, 0, 0)], [0.6, withOffset(la, 8, 0, 0)]],
    RightArm: [[0, withOffset(ra, 8, 0, 0)], [0.3, withOffset(ra, 14, 0, 0)], [0.6, withOffset(ra, 8, 0, 0)]],
  });
}

// ── unchanged from M24 (arm swings here are already large and readable) ──
export function buildJumpUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'jump_up', 0.45, {
    Spine: [[0, 18, 0, 0], [0.2, -8, 0, 0], [0.45, -4, 0, 0]],
    LeftUpLeg: [[0, -45, 0, 6], [0.2, -18, 0, 3], [0.45, -25, 0, 4]],
    LeftLeg: [[0, 65, 0, 0], [0.2, 18, 0, 0], [0.45, 30, 0, 0]],
    RightUpLeg: [[0, -45, 0, -6], [0.2, -18, 0, -3], [0.45, -25, 0, -4]],
    RightLeg: [[0, 65, 0, 0], [0.2, 18, 0, 0], [0.45, 30, 0, 0]],
    LeftArm: [[0, 40, 0, 12], [0.2, -120, 0, 8], [0.45, -100, 0, 8]],
    RightArm: [[0, 40, 0, -12], [0.2, -120, 0, -8], [0.45, -100, 0, -8]],
  }, [[0, -0.18], [0.2, 0.02], [0.45, 0]]);
}

export function buildJumpLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'jump_land', 0.35, {
    Spine: [[0, -4, 0, 0], [0.15, 24, 0, 0], [0.35, 6, 0, 0]],
    LeftUpLeg: [[0, -25, 0, 4], [0.15, -55, 0, 8], [0.35, -14, 0, 4]],
    LeftLeg: [[0, 30, 0, 0], [0.15, 80, 0, 0], [0.35, 18, 0, 0]],
    RightUpLeg: [[0, -25, 0, -4], [0.15, -55, 0, -8], [0.35, -14, 0, -4]],
    RightLeg: [[0, 30, 0, 0], [0.15, 80, 0, 0], [0.35, 18, 0, 0]],
    LeftArm: [[0, -100, 0, 8], [0.15, 30, 0, 22], [0.35, 12, 0, 10]],
    RightArm: [[0, -100, 0, -8], [0.15, 30, 0, -22], [0.35, 12, 0, -10]],
  }, [[0, 0.02], [0.15, -0.24], [0.35, 0]]);
}
