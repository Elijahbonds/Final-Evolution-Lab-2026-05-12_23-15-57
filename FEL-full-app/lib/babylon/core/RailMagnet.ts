// THE RAIL MAGNET (VENICE-SKATE-THPS, 2026-09-09).
//
// Skate's rail never locked. The Rider's own `tryGrind` is a 1.1 m sphere around `root.position`, and on a board rider
// the root sits at the FEET — so a bar half a metre off the ground has already spent half the budget on height before
// the run starts, leaving a sub-metre horizontal window to thread at 8 m/s, on the single frame a button happens to be
// down. Elijah's eye, "Y / i toward the golden patrol rail, no lock, no console line, goal 0/4", is exactly what that
// geometry produces.
//
// THPS does not ask for the button: you ride over a rail and the board finds it. So this is a wider catch with real
// qualifications instead — and the qualifications are the whole point, because a magnet without them is worse than no
// magnet: it snaps you onto rails you were only crossing, and it catches the last centimetre of a rail you are already
// leaving (which reads as "GRIND!" and then nothing, while paying a full bonus for it).
//
// Pure maths, no scene: the mode feeds it the rail, the feet and the run, and it answers with a reason.

import { Vector3 } from '@babylonjs/core';

export interface RailWindow {
  /** Catch radius in metres, measured from the rider's feet. */
  reach: number;
  /** Minimum |cos| between the run direction and the rail: 1 = straight down it, 0 = square across it. */
  align: number;
  /** Fraction of the rail at each end that will not catch (the runway a lock needs to be worth anything). */
  endBand?: number;
  /** How far the bar may sit ABOVE the feet and still catch (m) — you land on a rail, you do not rise onto one. */
  heightSlack?: number;
}

export type RailVerdict =
  | { ok: true; t: number; d: number }
  | { ok: false; why: 'far' | 'end' | 'above' | 'across' | 'still'; t: number; d: number };

/** Closest point on segment a→b to p, clamped to the segment. */
export function nearestOnSegment(a: Vector3, b: Vector3, p: Vector3): { point: Vector3; d: number; t: number } {
  const ab = b.subtract(a);
  const t = Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / Math.max(ab.lengthSquared(), 1e-9)));
  const point = Vector3.Lerp(a, b, t);
  return { point, d: Vector3.Distance(point, p), t };
}

/**
 * Would this rail catch these feet, moving this way?
 *
 * The four refusals, in the order they cost a run:
 *  - `far`    — outside the catch sphere.
 *  - `end`    — inside the sphere but at the rail's last few percent: the grind would dismount on its first step.
 *  - `above`  — the bar is over the deck; a rider falls onto a rail, never up onto one.
 *  - `across` — the run points across the rail rather than down it, so crossing a rail still crosses it.
 *  - `still`  — no run at all (a parked rider standing on a rail is not grinding it).
 */
export function qualifyRail(a: Vector3, b: Vector3, feet: Vector3, run: Vector3, w: RailWindow): RailVerdict {
  const endBand = w.endBand ?? 0.08;
  const slack = w.heightSlack ?? 0.35;
  const { point, d, t } = nearestOnSegment(a, b, feet);
  if (d > w.reach) return { ok: false, why: 'far', t, d };
  if (t < endBand || t > 1 - endBand) return { ok: false, why: 'end', t, d };
  if (point.y > feet.y + slack) return { ok: false, why: 'above', t, d };
  const along = b.subtract(a); along.y = 0;
  const flat = new Vector3(run.x, 0, run.z);
  if (along.lengthSquared() < 1e-6 || flat.lengthSquared() < 1e-6) return { ok: false, why: 'still', t, d };
  if (Math.abs(Vector3.Dot(along.normalize(), flat.normalize())) < w.align) return { ok: false, why: 'across', t, d };
  return { ok: true, t, d };
}

/** The nearest QUALIFYING rail, not the first one in the list — the plaza's rails cross, and list order handed the
 *  lock to a rail the rider was not on. */
export function pickRail<T extends { a: Vector3; b: Vector3 }>(
  lines: readonly T[], feet: Vector3, run: Vector3, w: RailWindow,
): T | null {
  let best: T | null = null, bestD = Infinity;
  for (const l of lines) {
    const v = qualifyRail(l.a, l.b, feet, run, w);
    if (v.ok && v.d < bestD) { best = l; bestD = v.d; }
  }
  return best;
}
