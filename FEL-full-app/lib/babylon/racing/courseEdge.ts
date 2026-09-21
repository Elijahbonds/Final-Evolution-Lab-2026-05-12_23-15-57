// The outside edge of a kart course.
//
// WHY THIS EXISTS (2026-09-20, owner: "fix the aero ace and karting modes"). Aero turns you back at its corridor;
// the kart had no boundary at all. Measured by steering off the course with the throttle pinned: the kart drove to
// 76 m from the racing line — more than eight road-widths out — and kept accruing race distance at the on-road rate
// the whole way, at a steady 11.7 m/s. Nothing stopped it, nothing brought it back, and the course was a suggestion.
//
// The mode's own rule is that leaving the line costs TIME, not a stop ("a race that stops for a cone is not a race"),
// so this is not a respawn and not a wall. Past the verge the ground pulls you back, harder the further out you are,
// and it settles at a few metres over rather than pinning you against a line. You can still cut a corner onto the
// grass and pay for it in grip; you cannot drive to the horizon.

/** Grass outside the road that is still fair game, in metres beyond the road's half-width. */
export const VERGE_M = 8;
/** How hard the ground pulls you back, per second, outside the verge. */
export const RETURN_RATE = 4;

/** How far from the racing line a kart may get before the ground starts pulling it back. */
export function edgeLimit(halfWidth: number, verge = VERGE_M): number {
  return Math.max(0, halfWidth) + Math.max(0, verge);
}

/**
 * Metres to move the kart back toward the racing line this frame — signed the same way as `lateral`, so the caller
 * SUBTRACTS it. Zero anywhere inside the verge.
 *
 * Frame-rate independent: the pull is an exponential ease on the excess, so the same drive settles in the same place
 * at 30 fps and at 144 fps. A per-frame fraction would pull twice as hard on a fast machine.
 */
export function edgeReturn(lateral: number, limit: number, dt: number, rate = RETURN_RATE): number {
  const over = Math.abs(lateral) - limit;
  if (!(over > 0) || !(dt > 0)) return 0;
  return Math.sign(lateral) * over * (1 - Math.exp(-rate * dt));
}

/**
 * Where a kart driving straight out at `speed` settles, in metres past the limit: the point where the outward speed
 * and the pull balance. The boundary is soft on purpose, so this is the number that says HOW soft.
 */
export function settleOver(speed: number, rate = RETURN_RATE): number {
  return rate > 0 ? Math.max(0, speed) / rate : Infinity;
}
