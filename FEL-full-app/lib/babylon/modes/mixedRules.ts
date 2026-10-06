// mixedRules — the small rules Mixed Combat's owner-picked pass added (IMPROVE 2026-10-06). PURE: no Babylon, no DOM, so
// each is tested on its own (MixedCombatMode.improve.test.ts); MixedCombatMode mounts Babylon and only calls these.

import { hasFightMove, type FightRatings } from '../core/FighterStyle';

/**
 * THE DRAGON IS THE PIT'S (IMPROVE 2026-10-06, items #5 / #6). The finisher's huge knockback is THIS mode's ring-out
 * tool (the header says so), but the game-wide licence is force 78 (FighterStyle) and every body in this mode fought at
 * or under it: the rival always at the 50 baseline, a guest and a READY player at 50, PRIMED at 70. So the move the
 * mode is built around was out of reach for nearly everyone, and the rival's full bar (brain.setCanSpecial(false))
 * could never be spent — FOE CHI sat at 100 for the rest of the match.
 *
 * In the pit, a FULL CHI BAR is the licence, for both fighters alike: the cost is still the whole bar, and the force
 * gate still decides it everywhere else (Karate VS keeps FighterStyle's rule untouched). A body that already has the
 * force for it is licensed here too, so `?fight=` and the ELITE band read the same as before.
 */
export const PIT_LICENSES_DRAGON = true;
export function dragonLicensed(r: FightRatings): boolean {
  return PIT_LICENSES_DRAGON || hasFightMove('dragon', r);
}

/** A ring-out victim's fall: 0.14 m a RENDER before (8.4 m/s at 60 Hz, twice that at 120 Hz). The same 8.4 m/s, per
 *  second of the clock it is handed, down to where the pit swallows it. */
export const FALL = { mps: 8.4, floorY: -5.5 } as const;
/** One step of the fall. Returns the new height and whether the body is still falling. */
export function fallStep(y: number, dt: number): { y: number; falling: boolean } {
  const ny = y - FALL.mps * Math.max(0, dt);
  return { y: ny, falling: ny >= FALL.floorY };
}

/** The panic roll's direction (a neutral stick): straight AWAY from the rival. It rolled along the camera's forward —
 *  the fight camera sits behind the player looking at the rival, so that was INTO him. Two bodies on one spot fall
 *  back to the camera's back (`fwd` = the camera's flat forward). */
export function neutralRollDir(me: { x: number; z: number }, foe: { x: number; z: number }, fwd: { x: number; z: number }): { x: number; z: number } {
  const x = me.x - foe.x, z = me.z - foe.z, d = Math.hypot(x, z);
  if (d > 1e-3) return { x: x / d, z: z / d };
  return { x: -fwd.x, z: -fwd.z };
}

/** The phone crowd: every fourth spot of the ring, at most this many full animated rigs (Karate VS's number). */
export const PHONE_ONLOOKERS = 4;
export function onlookerSpots<T>(spots: readonly T[], mobile: boolean): T[] {
  return mobile ? spots.filter((_, i) => i % 4 === 0).slice(0, PHONE_ONLOOKERS) : spots.slice();
}

// (The result score is core/MixedScore: a server route imports its maximum, and a server import may not reach modes/.)
