/**
 * The movement state machine (lane A1; docs/ADVENTURE-PLAN.md "movement/state.ts").
 *
 * A1 is the ONLY writer of `actor.state` (contracts.ts). The other lanes ask through the fields they own:
 *   - A2 drops `stats.hp.cur` to zero      → 'ko'      (and the rider leaves its rail, its mount, its flight)
 *   - A2 sets `stunSec` > 0                 → 'stunned' (the same, for as long as it lasts)
 *   - A1 sets `ridingId` (the mount verb)   → 'riding'
 *   - A1 sets `wantsFlight` and a source exists (contracts.flightSourceOf) → 'flight'
 * Everything else follows the body: 'ground' on the ground, 'air' off it, 'grind' on a rail, 'wallrun' on a wall.
 *
 * THE TRANSITIONS (every one is tested in state.test.ts):
 *   ground  → air (jump, a ledge, a launch) · grind (a low rail run onto) · wallrun (jump into a wall) · riding
 *   air     → ground (land) · grind (the catch) · wallrun · flight (take off) · riding
 *   grind   → air (jump off, the end, a slip, a hit) · grind (a switch)
 *   wallrun → air (time out, the kick)
 *   flight  → ground (land) · air (the source is gone: unfused, dismounted)
 *   riding  → air (dismount, thrown off)
 *   any     → stunned (stunSec > 0) → ground / air when it ends
 *   any     → ko (hp ≤ 0) → ground / air when revived (A3 restores hp)
 * Priority, highest first: ko, stunned, riding, then the body.
 */

import type { AdventureActor, AdventureBus, MovementState } from '../contracts';

/** The state another lane's field forces this tick, or null when the body decides. */
export function forcedState(actor: Pick<AdventureActor, 'stats' | 'stunSec' | 'ridingId'>): MovementState | null {
  if (!(actor.stats.hp.cur > 0)) return 'ko';
  if (actor.stunSec > 0) return 'stunned';
  if (actor.ridingId) return 'riding';
  return null;
}

/** Change state (no-op when unchanged): reset the state clock and tell the bus. */
export function enterState(actor: AdventureActor, to: MovementState, bus: AdventureBus): void {
  if (actor.state === to) return;
  const from = actor.state;
  actor.state = to;
  actor.stateSec = 0;
  bus.emit('state', { actorId: actor.id, from, to });
}

/** The state a body settles into when nothing forces one: on the ground or not. */
export const settleState = (grounded: boolean): MovementState => (grounded ? 'ground' : 'air');

/** States in which the body is under the player's control (not stunned, not down, not carried). */
export const isControlled = (s: MovementState): boolean => s !== 'stunned' && s !== 'ko' && s !== 'riding';
