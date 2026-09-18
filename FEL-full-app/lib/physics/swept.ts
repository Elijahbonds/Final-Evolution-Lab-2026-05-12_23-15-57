// ─────────────────────────────────────────────────────────────────────────────
// M14 collision hardening — PURE 1-D swept helpers (NO three/react/DOM imports).
//
// Frame-rate-independent building blocks for continuous collision so fast bodies
// can't skip past a boundary or double-flip against a wall between frames. Used
// today by the tennis wall reflection; reusable by any mode that integrates a
// 1-D position/velocity per axis.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True if the scalar crossed `threshold` between `prev` and `cur` (either
 * direction), or landed exactly on it. Robust to large per-frame steps: it looks
 * at the sign of (value − threshold) at both ends rather than testing a thin band.
 */
export function crossedThreshold(prev: number, cur: number, threshold: number): boolean {
  const a = prev - threshold;
  const b = cur - threshold;
  if (a === 0 || b === 0) return true;
  return (a < 0) !== (b < 0);
}

/** Fraction 0..1 along prev→cur at which `threshold` is crossed (0 if no motion). */
export function timeOfCrossing(prev: number, cur: number, threshold: number): number {
  const denom = cur - prev;
  if (denom === 0) return 0;
  const t = (threshold - prev) / denom;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export interface Reflect1D {
  /** Corrected position after reflecting off whichever wall was crossed. */
  pos: number;
  /** Corrected velocity (sign flipped exactly once if a wall was hit). */
  vel: number;
  /** True when a wall was actually crossed this step. */
  bounced: boolean;
}

/**
 * Swept reflection inside [min, max]. Given the pre-integration position and the
 * velocity for this step, advance by dt and reflect off the near wall, folding
 * any overshoot back into the interval. This both prevents a body from escaping
 * the bounds at high speed AND prevents the classic "stuck at the wall" double-
 * flip you get from a naive `if (x < min) v = -v` test evaluated every frame.
 */
export function reflect1D(pos: number, vel: number, dt: number, min: number, max: number): Reflect1D {
  let next = pos + vel * dt;
  let v = vel;
  let bounced = false;
  // Reflect repeatedly in case a very fast body overshoots the whole interval.
  // Guard the loop so degenerate bounds can never spin forever.
  let guard = 0;
  const span = max - min;
  if (!(span > 0)) return { pos: next, vel: v, bounced: false };
  while (guard++ < 8) {
    if (next < min) { next = min + (min - next); v = Math.abs(v); bounced = true; }
    else if (next > max) { next = max - (next - max); v = -Math.abs(v); bounced = true; }
    else break;
  }
  // Final clamp for safety against floating-point residue.
  if (next < min) next = min;
  else if (next > max) next = max;
  return { pos: next, vel: v, bounced };
}
