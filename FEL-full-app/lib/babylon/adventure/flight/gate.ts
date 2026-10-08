/**
 * The flight gate (lane A1; docs/ADVENTURE-PLAN.md "flight/gate.ts").
 *
 * The owner's rule (2026-10-06): flight is a thing once you FUSE with your partner, or when you RIDE a partner that can
 * fly. Never unfused and on foot. The answer is contracts.flightSourceOf, so A1, the BR bot brain and A3's HUD read the
 * same one; this file adds the "may this body take off right now" and the speed a source flies at.
 */

import type { AdventureActor, FlightSource } from '../contracts';
import { flightSourceOf } from '../contracts';
import type { FlightExtra } from './params';

export { flightSourceOf };

/** May this body leave the ground into flight this tick? A source, and a body under its own control. */
export function canTakeOff(
  actor: Pick<AdventureActor, 'fusion' | 'ridingId' | 'stunSec' | 'stats'>, mountCanFly: boolean,
): FlightSource | null {
  if (!(actor.stats.hp.cur > 0) || actor.stunSec > 0) return null;
  return flightSourceOf(actor, mountCanFly);
}

/**
 * The flight speed multiplier: a fusion flies faster as its tier grows (contracts: "Tier drives ... flight speed"); a
 * mount flies at its own multiplier. PRQ's flight feel rides on top (params.movementFeelFor).
 */
export function flightSpeedMult(
  source: FlightSource, fusionTier: number, mountFlyMult: number, fx: Pick<FlightExtra, 'tierSpeed'>, feelFlight = 1,
): number {
  const base = source === 'fusion' ? 1 + fx.tierSpeed * Math.max(0, fusionTier) : mountFlyMult;
  return base * feelFlight;
}
