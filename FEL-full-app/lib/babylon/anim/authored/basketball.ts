// Basketball packages (Phase 4, ship pass 2026-09-03) — the moves the 2K
// benchmark expects to SEE, not just resolve: a live dribble, size-ups
// (crossover / hesi), the layup gather, a defensive slide, a block reach and
// a steal reach. Before this file every one of them aliased onto run, guard
// or jumpshot (clipAliases.ts), so a crossover looked like jogging.
//
// Built the way locomotion.ts builds: arms ride the MEASURED arms-down rest
// (solveArmsDown) so the pose never drifts toward the T-pose bind, and every
// offset is proven on the real forge rig by basketball.test.ts (hand / knee /
// hip world positions at the clip's key frame), not eyeballed.
//
// Local-offset vocabulary on a dropped arm (withOffset(rest, x, y, z)):
//   y  swings the arm forward (+) / back (−)
//   z  raises it sideways toward the T (+ left / − right) — ±162 is overhead
//   x  twists about the limb (invisible on a capsule; used sparingly)

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { solveArmsDown, buildQuatClip, withOffset, eulerQ, type RestPose } from '../restPose';

const restCache = new WeakMap<Skeleton, RestPose>();
function restFor(sk: Skeleton): RestPose {
  let r = restCache.get(sk);
  if (!r) { r = solveArmsDown(sk, 72); restCache.set(sk, r); }
  return r;
}

export const BASKETBALL_CLIPS = [
  'bball_dribble_idle', 'bball_crossover_left', 'bball_crossover_right', 'bball_hesi',
  'bball_layup_gather', 'bball_defend_slide_left', 'bball_defend_slide_right',
  'bball_block_reach', 'bball_steal_reach',
] as const;

/** Ball-hand pump on a bent-knee stance. Loops. */
export function buildDribbleIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), rf = r.get('RightForeArm');
  if (!la || !ra) return null;
  const tracks: Record<string, [number, ReturnType<typeof eulerQ>][]> = {
    Spine: [[0, eulerQ(14, 0, 0)], [0.4, eulerQ(17, 0, 0)], [0.8, eulerQ(14, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-22, 0, 8)], [0.8, eulerQ(-22, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-22, 0, -8)], [0.8, eulerQ(-22, 0, -8)]],
    LeftLeg: [[0, eulerQ(34, 0, 0)], [0.8, eulerQ(34, 0, 0)]],
    RightLeg: [[0, eulerQ(34, 0, 0)], [0.8, eulerQ(34, 0, 0)]],
    LeftArm: [[0, withOffset(la, 0, 18, 6)], [0.8, withOffset(la, 0, 18, 6)]],
    RightArm: [[0, withOffset(ra, 0, 38, -8)], [0.4, withOffset(ra, 0, 58, -6)], [0.8, withOffset(ra, 0, 38, -8)]],
  };
  if (rf) tracks.RightForeArm = [[0, withOffset(rf, 0, 30, 0)], [0.4, withOffset(rf, 0, 10, 0)], [0.8, withOffset(rf, 0, 30, 0)]];
  return buildQuatClip(scene, sk, 'bball_dribble_idle', 0.8, tracks, [[0, -0.05], [0.4, -0.07], [0.8, -0.05]]);
}

/** Crossover: hips and shoulders snap to the new side, the ball hand sweeps across. */
export function buildCrossover(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, `bball_crossover_${dir}`, 0.45, {
    Hips: [[0, eulerQ(0, 0, 0)], [0.2, eulerQ(0, 28 * s, 0)], [0.45, eulerQ(0, 6 * s, 0)]],
    Spine: [[0, eulerQ(14, 0, 0)], [0.2, eulerQ(20, -14 * s, 0)], [0.45, eulerQ(14, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-22, 0, 8)], [0.2, eulerQ(-34, 0, 18)], [0.45, eulerQ(-22, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-22, 0, -8)], [0.2, eulerQ(-34, 0, -18)], [0.45, eulerQ(-22, 0, -8)]],
    LeftArm: [[0, withOffset(la, 0, 20, 6)], [0.2, withOffset(la, 0, 55, -30 * s)], [0.45, withOffset(la, 0, 20, 6)]],
    RightArm: [[0, withOffset(ra, 0, 45, -8)], [0.2, withOffset(ra, 0, 60, 30 * s)], [0.45, withOffset(ra, 0, 45, -8)]],
  }, [[0, -0.05], [0.2, -0.09], [0.45, -0.05]]);
}

/** Hesitation: a stutter — the body checks, the ball hand holds, the knees load. */
export function buildHesi(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, 'bball_hesi', 0.55, {
    Spine: [[0, eulerQ(14, 0, 0)], [0.2, eulerQ(4, 0, 0)], [0.35, eulerQ(6, 0, 0)], [0.55, eulerQ(16, 0, 0)]],
    Neck: [[0, eulerQ(0, 0, 0)], [0.2, eulerQ(-8, 0, 0)], [0.55, eulerQ(0, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-22, 0, 8)], [0.2, eulerQ(-10, 0, 8)], [0.55, eulerQ(-28, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-22, 0, -8)], [0.2, eulerQ(-10, 0, -8)], [0.55, eulerQ(-28, 0, -8)]],
    LeftArm: [[0, withOffset(la, 0, 18, 6)], [0.55, withOffset(la, 0, 18, 6)]],
    RightArm: [[0, withOffset(ra, 0, 40, -8)], [0.2, withOffset(ra, 0, 44, -8)], [0.55, withOffset(ra, 0, 40, -8)]],
  }, [[0, -0.05], [0.2, -0.02], [0.55, -0.08]]);
}

/** Layup gather: the inside knee drives up as the ball hand rises. */
export function buildLayupGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, 'bball_layup_gather', 0.5, {
    Spine: [[0, eulerQ(12, 0, 0)], [0.3, eulerQ(-6, 0, 0)], [0.5, eulerQ(-4, 0, 0)]],
    RightUpLeg: [[0, eulerQ(-20, 0, -6)], [0.3, eulerQ(-82, 0, -4)], [0.5, eulerQ(-70, 0, -4)]],
    RightLeg: [[0, eulerQ(30, 0, 0)], [0.3, eulerQ(78, 0, 0)], [0.5, eulerQ(60, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-20, 0, 6)], [0.3, eulerQ(4, 0, 4)], [0.5, eulerQ(8, 0, 4)]],
    LeftArm: [[0, withOffset(la, 0, 20, 6)], [0.3, withOffset(la, 0, 40, 30)], [0.5, withOffset(la, 0, 35, 30)]],
    RightArm: [[0, withOffset(ra, 0, 45, -8)], [0.3, withOffset(ra, 0, 40, -150)], [0.5, withOffset(ra, 0, 30, -162)]],
  }, [[0, -0.05], [0.3, 0.02], [0.5, 0.05]]);
}

/** Defensive slide: wide, low, arms out and low. Loops. */
export function buildDefendSlide(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, `bball_defend_slide_${dir}`, 0.5, {
    Hips: [[0, eulerQ(0, 0, 4 * s)], [0.25, eulerQ(0, 0, 8 * s)], [0.5, eulerQ(0, 0, 4 * s)]],
    Spine: [[0, eulerQ(22, 0, -4 * s)], [0.5, eulerQ(22, 0, -4 * s)]],
    LeftUpLeg: [[0, eulerQ(-28, 0, 22)], [0.25, eulerQ(-34, 0, 30)], [0.5, eulerQ(-28, 0, 22)]],
    RightUpLeg: [[0, eulerQ(-28, 0, -22)], [0.25, eulerQ(-22, 0, -14)], [0.5, eulerQ(-28, 0, -22)]],
    LeftLeg: [[0, eulerQ(40, 0, 0)], [0.5, eulerQ(40, 0, 0)]],
    RightLeg: [[0, eulerQ(40, 0, 0)], [0.5, eulerQ(40, 0, 0)]],
    // arms low and in front (measured 2026-09-03: +34 raise read as a T-pose)
    LeftArm: [[0, withOffset(la, 0, 36, 14)], [0.5, withOffset(la, 0, 36, 14)]],
    RightArm: [[0, withOffset(ra, 0, 36, -14)], [0.5, withOffset(ra, 0, 36, -14)]],
  }, [[0, -0.10], [0.25, -0.12], [0.5, -0.10]]);
}

/** Block reach: both arms straight overhead. One-shot; the mode owns the jump. */
export function buildBlockReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm');
  if (!la || !ra) return null;
  return buildQuatClip(scene, sk, 'bball_block_reach', 0.5, {
    Spine: [[0, eulerQ(8, 0, 0)], [0.25, eulerQ(-8, 0, 0)], [0.5, eulerQ(-6, 0, 0)]],
    LeftArm: [[0, withOffset(la, 0, 20, 6)], [0.25, withOffset(la, 0, 6, 164)], [0.5, withOffset(la, 0, 6, 160)]],
    RightArm: [[0, withOffset(ra, 0, 20, -6)], [0.25, withOffset(ra, 0, 6, -164)], [0.5, withOffset(ra, 0, 6, -160)]],
  });
}

/** Steal reach: the lead hand flashes forward and low, the torso follows. */
export function buildStealReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const r = restFor(sk); const la = r.get('LeftArm'), ra = r.get('RightArm'), rf = r.get('RightForeArm');
  if (!la || !ra) return null;
  const tracks: Record<string, [number, ReturnType<typeof eulerQ>][]> = {
    Spine: [[0, eulerQ(16, 0, 0)], [0.15, eulerQ(26, -12, 0)], [0.35, eulerQ(16, 0, 0)]],
    LeftUpLeg: [[0, eulerQ(-22, 0, 8)], [0.15, eulerQ(-30, 0, 10)], [0.35, eulerQ(-22, 0, 8)]],
    RightUpLeg: [[0, eulerQ(-22, 0, -8)], [0.15, eulerQ(-14, 0, -8)], [0.35, eulerQ(-22, 0, -8)]],
    LeftArm: [[0, withOffset(la, 0, 20, 6)], [0.35, withOffset(la, 0, 20, 6)]],
    RightArm: [[0, withOffset(ra, 0, 30, -8)], [0.15, withOffset(ra, 0, 92, -18)], [0.35, withOffset(ra, 0, 30, -8)]],
  };
  if (rf) tracks.RightForeArm = [[0, withOffset(rf, 0, 20, 0)], [0.15, withOffset(rf, 0, 4, 0)], [0.35, withOffset(rf, 0, 20, 0)]];
  return buildQuatClip(scene, sk, 'bball_steal_reach', 0.35, tracks, [[0, -0.05], [0.15, -0.08], [0.35, -0.05]]);
}
