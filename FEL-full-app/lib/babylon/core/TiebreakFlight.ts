// Tiebreak Blitz — where the ball is drawn (IMPROVE 2026-10-06, #8 #14 #15). Pure: no Babylon, so the path is testable and
// the mode writes into one reused point instead of allocating a vector a frame. The rules (TiebreakBlitz) never read this:
// the hit window is the same seconds whatever arc is drawn.
import type { Side } from './TiebreakBlitz';

/** Your baseline and the rival's. */
export const NEAR_Z = 10;
export const FAR_Z = -10;
/** Where the incoming ball meets your racket, short of your baseline. */
export const CONTACT_Z = NEAR_Z - 1.2;
/** The rival strikes at this height; you meet the ball at CONTACT_Y on the rise after the bounce. */
export const STRIKE_Y = 1.15;
export const CONTACT_Y = 1.05;
/** The ball's radius (the mesh is 0.14 across): a bounce touches the court here. */
export const BALL_R = 0.07;
/**
 * #15 — TUNED (new): the ball lands at this fraction of the incoming flight, just before the hit window opens (0.80–0.89 of
 * the flight), so the bounce is the timing anchor a tennis player reads. The window's seconds are unchanged.
 */
export const BOUNCE_AT = 0.7;
/** Apex of the incoming arc over the straight line between strike and bounce (metres). */
const ARC_IN = 1.6;
/** #8: apex of your return's arc on its way out. */
const ARC_OUT = 1.2;

export interface Pt { x: number; y: number; z: number }

/** The incoming ball's lateral position: from near the middle at the rival's racket out to its side at yours. */
export function incomingX(side: Side, p: number): number {
  return (side === 'left' ? -2.5 : 2.5) * (0.35 + 0.65 * p);
}

/** The ball's height on the incoming flight: one arc down to the bounce, then up to your contact height. */
export function incomingY(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  if (q <= BOUNCE_AT) {
    const u = q / BOUNCE_AT;
    return STRIKE_Y + (BALL_R - STRIKE_Y) * u + Math.sin(u * Math.PI) * ARC_IN;
  }
  const u = (q - BOUNCE_AT) / (1 - BOUNCE_AT);
  return BALL_R + (CONTACT_Y - BALL_R) * Math.sin(u * Math.PI / 2);
}

/** The incoming ball at flight fraction p (0 the rival's strike, 1 your racket). Writes into `out`. */
export function incomingPoint(side: Side, p: number, out: Pt): Pt {
  const q = Math.min(1, Math.max(0, p));
  out.x = incomingX(side, q);
  out.y = incomingY(q);
  out.z = FAR_Z + (CONTACT_Z - FAR_Z) * q;
  return out;
}

/** #8: your return on its way out, q 0 (your racket, `from`) → 1 (the rival's strike, `to`). Writes into `out`. */
export function outgoingPoint(from: Pt, to: Pt, q: number, out: Pt): Pt {
  const u = Math.min(1, Math.max(0, q));
  out.x = from.x + (to.x - from.x) * u;
  out.y = from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * ARC_OUT;
  out.z = from.z + (to.z - from.z) * u;
  return out;
}

/** #14: the ground blob under the ball — full size and darkest on the court, smaller and fainter as the ball climbs. */
export function shadowScale(y: number): number {
  return Math.max(0.45, 1 - Math.max(0, y - BALL_R) * 0.2);
}
