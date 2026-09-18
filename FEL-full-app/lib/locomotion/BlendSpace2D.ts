// LOCOMOTION CORE — BlendSpace2D (Phase 1, 2026-09-12).
//
// Weights come from LOCAL-space velocity, never from a scalar speed. Phase 0 found the live
// trees pick exactly one clip from an if/else chain (audit §3), which is why a lateral vector
// could play a forward run: there was no lateral axis to read.

import type { BlendWeights, Dir8, LocomotionProfile, RingClips, SpeedRing } from './types';

/** Compass points in order, each with its unit vector in local space (+z forward, +x right). */
const DIRS: ReadonlyArray<readonly [Dir8, number, number]> = [
  ['F', 0, 1], ['FR', 0.7071, 0.7071], ['R', 1, 0], ['BR', 0.7071, -0.7071],
  ['B', 0, -1], ['BL', -0.7071, -0.7071], ['L', -1, 0], ['FL', -0.7071, 0.7071],
];

/** Nearest compass point to a local-space vector. */
export function dirFor(localX: number, localZ: number): Dir8 {
  if (Math.abs(localX) < 1e-6 && Math.abs(localZ) < 1e-6) return 'F';
  let best: Dir8 = 'F', bestDot = -Infinity;
  const len = Math.hypot(localX, localZ);
  const nx = localX / len, nz = localZ / len;
  for (const [d, dx, dz] of DIRS) {
    const dot = nx * dx + nz * dz;
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best;
}

/** The authored clip for a point, falling back to the nearest neighbour that HAS one.
 *  Phase 0: most points are unauthored today (no diagonals, no backpedal), so without this
 *  a diagonal stick would select nothing and the body would freeze mid-stride. */
export function clipForDir(ring: RingClips, dir: Dir8): string | null {
  const direct = ring.dirs[dir];
  if (direct) return direct;
  const idx = DIRS.findIndex(([d]) => d === dir);
  for (let step = 1; step <= 4; step++) {
    for (const probe of [idx - step, idx + step]) {
      const [d] = DIRS[((probe % 8) + 8) % 8];
      const clip = ring.dirs[d];
      if (clip) return clip;
    }
  }
  return null;
}

/**
 * Where a speed sits between rings.
 *
 * Returns the LOWER ring plus a continuous 0..1 fraction toward the next. An earlier version
 * snapped to whichever ring was nearer AND kept the fraction from the original pair, so the
 * instant t crossed 0.5 the blend pair changed underneath it and the weights jumped a full
 * 1.0 in one frame — caught by the Phase 3 discontinuity gate, which is what it is for.
 * `dominant` is the ring to REPORT (for state and HUD); the blend always runs lower -> next.
 */
export function ringFor(p: LocomotionProfile, speed: number): {
  lower: SpeedRing; next: SpeedRing; t: number; dominant: SpeedRing;
} {
  const order: SpeedRing[] = ['idle', 'shuffle', 'jog', 'sprint'];
  for (let i = 0; i < order.length - 1; i++) {
    const lo = p.rings[order[i]].speed, hi = p.rings[order[i + 1]].speed;
    if (speed <= hi) {
      const t = hi > lo ? Math.max(0, Math.min(1, (speed - lo) / (hi - lo))) : 0;
      return { lower: order[i], next: order[i + 1], t, dominant: t > 0.5 ? order[i + 1] : order[i] };
    }
  }
  return { lower: 'sprint', next: 'sprint', t: 0, dominant: 'sprint' };
}

/**
 * Blend weights for a local-space velocity.
 *
 * A LATERAL vector uses the slide ring when the profile has one — never a forward run clip
 * played sideways, which is the specific failure the brief calls out.
 */
export function blend2D(p: LocomotionProfile, localX: number, localZ: number, speed: number): BlendWeights {
  const dir = dirFor(localX, localZ);
  const lateral = dir === 'L' || dir === 'R';
  if (lateral && p.slideRing && speed > 0.15) {
    const clip = clipForDir(p.slideRing, dir);
    return { weights: clip ? { [clip]: 1 } : {}, ring: 'slide', dir };
  }
  const { lower, next, t, dominant } = ringFor(p, speed);
  const a = clipForDir(p.rings[lower], dir);
  const b = clipForDir(p.rings[next], dir);
  const weights: Record<string, number> = {};
  if (a && b && a !== b) { weights[a] = 1 - t; weights[b] = t; }
  else if (a) weights[a] = 1;
  else if (b) weights[b] = 1;
  const ring = dominant;
  return { weights, ring, dir };
}

/**
 * Rate-limit weight changes to the profile's blend time.
 *
 * The raw blend space answers "where should the body be in the space"; it does not answer
 * "how fast may the animator get there". Those are different questions and conflating them
 * is how a clip enters at full weight. The Phase 3 discontinuity gate caught the real case:
 * a hard plant sheds 0.79 m/s per frame (plantDecel 47.6), which crosses half the idle-to-walk
 * ring in ONE frame and moved a weight 0.496 in that frame. Physics is allowed to be that
 * abrupt; the blend is not.
 *
 * Each weight moves at most dt / blendSec per tick, so a full 0 -> 1 transition can never take
 * less than blendSec, whatever the velocity underneath it does.
 */
export function smoothWeights(
  prev: Readonly<Record<string, number>>,
  target: Readonly<Record<string, number>>,
  dt: number,
  blendSec: number,
): Record<string, number> {
  const step = blendSec > 0 ? dt / blendSec : 1;
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(target)]);
  for (const k of keys) {
    const from = prev[k] ?? 0;
    const to = target[k] ?? 0;
    const d = to - from;
    const v = Math.abs(d) <= step ? to : from + Math.sign(d) * step;
    if (v > 1e-4 || to > 1e-4) out[k] = v;
  }
  // NOT renormalised, deliberately. Dividing by the running sum re-amplifies exactly the
  // jump this function exists to cap: measured 0.269 in one frame against a 0.208 step, so
  // the guarantee "no weight moves more than dt/blendSec" was being broken by the tidying-up
  // step itself. The target already sums to 1 and every key walks toward it monotonically,
  // so the set converges to 1 on its own within blendSec; a briefly-low sum is a partial
  // blend, which is what a blend IS.
  return out;
}
