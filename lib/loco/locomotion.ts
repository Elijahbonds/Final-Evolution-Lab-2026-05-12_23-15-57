/**
 * lib/loco/locomotion.ts
 * ======================
 * M14-P2 — the locomotion BLEND TREE + stride-sync + root-motion module.
 *
 * WHY THIS EXISTS (the "kill the penguin walk" fix)
 * -------------------------------------------------
 * The shipped hero rig (elijah-hero.glb) authors its `walk`/`run` clips fully
 * IN PLACE: the Hips (root) translation track is flat — measured net planar
 * travel over a full cycle is 0. World movement is driven separately by the
 * gameplay LocomotionController (lib/loco/movement.ts). When an in-place clip
 * plays at a cadence that does NOT match the character's ground velocity, the
 * feet skate across the floor — that sliding, plus hard idle→walk snapping, is
 * exactly the "penguin walk".
 *
 * There are two textbook fixes for foot-sliding:
 *   (a) ROOT MOTION — drive world position FROM the clip's root track. Needs
 *       clips that actually carry root translation. Ours do not (measured), so
 *       we cannot use this for the hero, but we ship the extraction helpers so
 *       any re-exported clip that DOES carry root motion can be consumed, and
 *       so tests can assert the math.
 *   (b) STRIDE-SYNC (velocity-matched playback) — the inverse of (a): scale the
 *       clip's playback rate so its foot cadence matches ground speed. This is
 *       what we use for the in-place hero clips.
 *
 * Plus a real BLEND TREE: continuous crossfade weights across idle/walk/run/
 * sprint (not a hard band switch), so transitions read smooth.
 *
 * PURE math — no THREE, no DOM. Every feel constant is // TUNE(elijah).
 */

export type LocoBandName = 'idle' | 'walk' | 'run' | 'sprint';

export interface LocoWeights {
  idle: number;
  walk: number;
  run: number;
  sprint: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/* ════════════════════════════════════════════════════════════════════════
 * BLEND TREE — continuous crossfade weights as a function of speed01
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Normalized-speed (0..1) anchor points at which each band is fully weighted.
 * Between two adjacent anchors the weight crossfades linearly, so at most two
 * bands are ever non-zero and the four weights always sum to 1. // TUNE(elijah)
 */
export const LOCO_ANCHORS: Record<LocoBandName, number> = {
  idle: 0.0,
  walk: 0.22, // TUNE(elijah)
  run: 0.62, // TUNE(elijah)
  sprint: 1.0,
};

const ORDERED_BANDS: LocoBandName[] = ['idle', 'walk', 'run', 'sprint'];

/**
 * Continuous locomotion blend weights. Piecewise-linear crossfade between the
 * two bands whose anchors bracket `speed01`. Guarantees:
 *   • all four weights are in [0,1] and sum to 1 (±1e-9)
 *   • at most two weights are non-zero at once
 *   • idle weight is non-increasing, sprint weight is non-decreasing in speed
 */
export function locomotionBlend(speed01: number): LocoWeights {
  const s = clamp(speed01, 0, 1);
  const w: LocoWeights = { idle: 0, walk: 0, run: 0, sprint: 0 };

  // Below/at the first anchor → fully idle.
  if (s <= LOCO_ANCHORS.idle) {
    w.idle = 1;
    return w;
  }
  // At/above the last anchor → fully sprint.
  if (s >= LOCO_ANCHORS.sprint) {
    w.sprint = 1;
    return w;
  }
  // Find the bracketing pair of anchors.
  for (let i = 0; i < ORDERED_BANDS.length - 1; i++) {
    const lo = ORDERED_BANDS[i];
    const hi = ORDERED_BANDS[i + 1];
    const a = LOCO_ANCHORS[lo];
    const b = LOCO_ANCHORS[hi];
    if (s >= a && s <= b) {
      const t = b > a ? (s - a) / (b - a) : 0;
      w[lo] = 1 - t;
      w[hi] = t;
      return w;
    }
  }
  // Fallback (should be unreachable) — treat as idle rather than empty pose.
  w.idle = 1;
  return w;
}

/** The band carrying the greatest blend weight (ties resolve to the faster band). */
export function dominantBand(w: LocoWeights): LocoBandName {
  let best: LocoBandName = 'idle';
  let bestW = -1;
  for (const b of ORDERED_BANDS) {
    if (w[b] >= bestW) {
      bestW = w[b];
      best = b;
    }
  }
  return best;
}

/** Total non-idle weight — handy for driving a "movement" blend param 0..1. */
export function movementWeight(w: LocoWeights): number {
  return clamp(w.walk + w.run + w.sprint, 0, 1);
}

/* ════════════════════════════════════════════════════════════════════════
 * STRIDE-SYNC — velocity-matched playback for in-place clips
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * The normalized speed at which each locomotion clip's authored foot cadence
 * looks planted (no sliding) when played at timeScale = 1. Playback is then
 * scaled by (actualSpeed01 / referenceSpeed01) so faster movement steps faster
 * and slower movement steps slower — this is what removes foot-skate. Values
 * are the approximate band centres. // TUNE(elijah)
 */
export const LOCO_REF_SPEED01: Record<Exclude<LocoBandName, 'idle'>, number> = {
  walk: 0.20, // TUNE(elijah)
  run: 0.55, // TUNE(elijah)
  sprint: 0.90, // TUNE(elijah)
};

/** How far playback rate may stray from 1 so extreme speeds never look absurd. // TUNE(elijah) */
export const STRIDE_TS_CLAMP = { min: 0.55, max: 1.85 } as const;

/**
 * Stride-synced playback rate for an in-place locomotion clip. `speed01` is the
 * character's normalized ground speed; `band` selects the clip's reference
 * cadence. Idle returns 1 (idle is time-scaled elsewhere for a calm breath).
 */
export function strideSyncTimeScale(speed01: number, band: LocoBandName): number {
  if (band === 'idle') return 1;
  const ref = LOCO_REF_SPEED01[band];
  if (!ref || ref <= 0) return 1;
  return clamp(clamp(speed01, 0, 1) / ref, STRIDE_TS_CLAMP.min, STRIDE_TS_CLAMP.max);
}

/* ════════════════════════════════════════════════════════════════════════
 * ROOT-MOTION EXTRACTION — for clips that DO carry a root translation track
 * ════════════════════════════════════════════════════════════════════════ */

/** A translation track: keyframe times (s) and flat [x,y,z,...] values. */
export interface RootTrack {
  times: number[];
  values: number[];
}

function sampleXZ(track: RootTrack, frame: number): { x: number; z: number } {
  const i = clamp(frame, 0, track.times.length - 1);
  return { x: track.values[i * 3] ?? 0, z: track.values[i * 3 + 2] ?? 0 };
}

/** Net planar displacement between the first and last keyframe. */
export function rootMotionNetPlanar(track: RootTrack): { dx: number; dz: number; dist: number } {
  const n = track.times.length;
  if (n < 2) return { dx: 0, dz: 0, dist: 0 };
  const a = sampleXZ(track, 0);
  const b = sampleXZ(track, n - 1);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return { dx, dz, dist: Math.hypot(dx, dz) };
}

/** Total planar path length summed over every segment (≥ net displacement). */
export function rootMotionPathPlanar(track: RootTrack): number {
  const n = track.times.length;
  let path = 0;
  for (let i = 1; i < n; i++) {
    const p = sampleXZ(track, i - 1);
    const q = sampleXZ(track, i);
    path += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return path;
}

/** Per-frame planar delta (frame i is the step from i-1 → i; frame 0 is zero). */
export function rootMotionPerFrame(track: RootTrack): { dx: number; dz: number }[] {
  const n = track.times.length;
  const out: { dx: number; dz: number }[] = [{ dx: 0, dz: 0 }];
  for (let i = 1; i < n; i++) {
    const p = sampleXZ(track, i - 1);
    const q = sampleXZ(track, i);
    out.push({ dx: q.x - p.x, dz: q.z - p.z });
  }
  return out;
}

/** Clip duration (last − first keyframe time). */
export function trackDuration(track: RootTrack): number {
  const n = track.times.length;
  if (n < 2) return 0;
  return Math.max(0, track.times[n - 1] - track.times[0]);
}

/**
 * Native ground speed implied by a clip's root track (path length / duration).
 * Zero for an in-place clip. Used to derive a reference speed when a clip DOES
 * carry root motion (so stride-sync can be measured rather than tuned).
 */
export function clipReferenceSpeed(track: RootTrack): number {
  const dur = trackDuration(track);
  if (dur <= 1e-6) return 0;
  return rootMotionPathPlanar(track) / dur;
}

/** True if the track actually moves the root in the plane beyond `eps`. */
export function hasRootMotion(track: RootTrack, eps = 1e-3): boolean {
  return rootMotionPathPlanar(track) > eps;
}

/**
 * Whether the clip's net root motion points "forward". By convention forward is
 * −Z (matches the movement system's forward = (sin, −cos)). Returns true when
 * the dominant net component is along the chosen forward axis in the positive
 * forward sense. For clips with no root motion this is false.
 */
export function rootMotionForwardPositive(track: RootTrack, forwardAxis: 'z' | 'x' = 'z'): boolean {
  const { dx, dz, dist } = rootMotionNetPlanar(track);
  if (dist <= 1e-4) return false;
  if (forwardAxis === 'z') return -dz > Math.abs(dx) * 0.5;
  return dx > Math.abs(dz) * 0.5;
}
