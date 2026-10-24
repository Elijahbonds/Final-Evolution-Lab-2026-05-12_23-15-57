// MC75-2 (ALL-MODES-TO-75-2026-10-22 §8; CONTROLLER-FEEL-ALL-MODES T7 "Fighter start"): a fighter's walk no longer writes
// the stick's full velocity in one frame. Start: 0 → 90 % in 0.12–0.15 s over at least 4 frames; stop ≤ 0.10 s.
// A first-order lag per axis (frame-rate independent: the same 90 % time at 30, 60 or 120 fps). Pure.

/** Time for a start from rest to reach 90 % of the stick's speed (T7: 0.12–0.15 s). */
export const FIGHTER_START_90_SEC = 0.13;   //TUNE(elijah) — inside T7's 0.12–0.15 s
/** Time for a stop to bleed 90 % of the speed away (T7: stop ≤ 0.10 s). */
export const FIGHTER_STOP_90_SEC = 0.08;    //TUNE(elijah) — inside T7's ≤ 0.10 s
const LN10 = Math.log(10);

export interface PlanarVel { x: number; z: number }

/**
 * Move `cur` toward `want` over `dt` (mutates and returns `cur`). Speeding up (the wish is faster than the body) uses the
 * start time; slowing down or letting go uses the stop time.
 */
export function rampFighterVel(cur: PlanarVel, want: PlanarVel, dt: number): PlanarVel {
  if (!(dt > 0)) return cur;
  const speeding = Math.hypot(want.x, want.z) > Math.hypot(cur.x, cur.z);
  const tau = (speeding ? FIGHTER_START_90_SEC : FIGHTER_STOP_90_SEC) / LN10;
  const k = 1 - Math.exp(-dt / tau);
  cur.x += (want.x - cur.x) * k;
  cur.z += (want.z - cur.z) * k;
  return cur;
}
