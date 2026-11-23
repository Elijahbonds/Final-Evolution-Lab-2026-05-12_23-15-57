// PHYSICS ARENA — the basket is the ball going through the hoop (pure; no Babylon, no dice).
//
// The scoreboard reads this and nothing else. Two planes, the ball's CENTRE swept between its last two positions (never one
// frame's point, so a fast ball cannot step over a plane):
//   1. the ring's plane, crossed DOWNWARD with the centre inside the ring. The physics already made that possible or not: a ball
//      whose centre is inside the 0.2286 m ring at the plane has gone past the iron, a ball that only clipped it was pushed out.
//   2. a plane under the net (NET_CONFIRM_M down), crossed downward close under the ring. That is the confirmation: a ball that
//      dips into the ring and rattles back out (the in-and-out) crossed plane 1 but never plane 2, and does not count.
// A ball that came UP through the net from underneath is not a basket on its way back down (marked until it lands or is reset).

import type { P3 } from './hoopGeometry';

/** The confirming plane, this far under the ring (just under the net's bottom). */
export const NET_CONFIRM_M = 0.45;
/** Plane 2 counts within this of the ring's axis (the net steers the ball, it does not let it wander). */
export const CONFIRM_R_PAD = 0.12;
/** Plane 1 must be followed by plane 2 within this time, or the candidate is dropped (a ball resting in the net never happens
 *  with a cone that opens at the bottom, but a stuck sim must not score later). */
export const CONFIRM_MAX_SEC = 1.2;

export type SensorEvent = 'make' | 'rimEntry' | null;

export class HoopSensor {
  private candidateAt = -1;
  private fromBelow = false;
  private t = 0;

  constructor(private rim: Readonly<P3>, private rimRadius: number) {}

  /** Forget everything (a new shot, a reset). */
  reset(): void { this.candidateAt = -1; this.fromBelow = false; }

  /** One step of the ball's centre, prev → now, dt seconds. Returns 'make' once, on the step plane 2 is crossed. */
  step(prev: Readonly<P3>, now: Readonly<P3>, dt: number): SensorEvent {
    this.t += dt;
    const y1 = this.rim.y, y2 = this.rim.y - NET_CONFIRM_M;
    // a ball on the floor (or out of the hoop's reach) clears the "came up from below" mark
    if (now.y < 1.0) this.fromBelow = false;
    // plane 1 upward inside the cylinder: came up through the net
    if (prev.y < y1 && now.y >= y1) {
      const k = (y1 - prev.y) / (now.y - prev.y);
      if (this.radialAt(prev, now, k) < this.rimRadius + CONFIRM_R_PAD) this.fromBelow = true;
    }
    let ev: SensorEvent = null;
    // plane 1 downward
    if (prev.y >= y1 && now.y < y1 && !this.fromBelow) {
      const k = (prev.y - y1) / (prev.y - now.y);
      if (this.radialAt(prev, now, k) < this.rimRadius) { this.candidateAt = this.t; ev = 'rimEntry'; }
    }
    // plane 2 downward, after a plane-1 entry
    if (this.candidateAt >= 0 && prev.y >= y2 && now.y < y2) {
      const k = (prev.y - y2) / (prev.y - now.y);
      const ok = this.radialAt(prev, now, k) < this.rimRadius + CONFIRM_R_PAD;
      this.candidateAt = -1;
      if (ok) return 'make';
    }
    // a candidate that went back up over the ring (the in-and-out) or timed out is dropped
    if (this.candidateAt >= 0 && (now.y > y1 + 0.02 || this.t - this.candidateAt > CONFIRM_MAX_SEC)) this.candidateAt = -1;
    return ev;
  }

  private radialAt(a: Readonly<P3>, b: Readonly<P3>, k: number): number {
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    return Math.hypot(x - this.rim.x, z - this.rim.z);
  }
}

/**
 * The independent label the sensor is measured against (scripts/physics-arena-tests.ts): from the whole recorded path at the
 * physics step, did the ball end up UNDER the ring having come down through it? True when, after the last time the centre was
 * above the ring's plane, it reached NET_CONFIRM_M + 0.3 below the ring within the ring's radius + 0.2 of its axis, without ever
 * being in the net's band (the ring down to NET_CONFIRM_M) wider than the ring plus 6 cm. A different rule from the sensor's (no planes swept at
 * frame rate), so the two can disagree, and the test counts where they do.
 */
export function throughHoopLabel(path: readonly Readonly<P3>[], rim: Readonly<P3>, rimRadius: number): boolean {
  let lastAbove = -1;
  for (let i = 0; i < path.length; i++) if (path[i].y > rim.y) lastAbove = i;
  if (lastAbove < 0) return false;
  for (let i = lastAbove + 1; i < path.length; i++) {
    const p = path[i];
    const r = Math.hypot(p.x - rim.x, p.z - rim.z);
    // came down outside the ring: in the net's band, wider than the ring (the iron's outside edge plus the ball's give)
    if (p.y < rim.y && p.y > rim.y - NET_CONFIRM_M && r > rimRadius + 0.06) return false;
    if (p.y < rim.y - NET_CONFIRM_M - 0.3) return r < rimRadius + 0.2;
  }
  return false;
}
