/**
 * VENICE ↔ COAST: the boat door, the hub's side (lane/coast-door, 2026-11-18; docs/COAST-ISLANDS-PLAN.md phase F, "the Venice
 * door wired end to end").
 *
 * The plan's travel point is the pier end (`pier.end` in layout.ts: the Pier district, cells (0..1, 6), a V5 district). The hub
 * today walks only V1's courts district (hubWorld.v1Area), so the pier itself cannot be reached yet. Until it is built, the boat
 * waits at a landing on the sand west of the courts — a jetty out to the water's edge with the boat at its end — and the walk-up
 * ring at the jetty's head IS the pier end: the same spot id (`pier.end`), so the coast's way back (`/play/venice?spot=pier.end`,
 * lib/adventure/coast/door.ts) lands here. When the pier district is walkable, BOAT_STOP moves to layout.ts's pier end and
 * nothing else changes. assumption: the landing's place [TUNE].
 *
 * The walk-up is the courts' (hubSolids Walkup, V2): stand in the ring (its radius + 1 m) for a moment and the card comes up; it
 * stays until you are a metre past. Pure: no Babylon.
 */

import { SPOTS, type Spot } from './layout';
import { RING } from './courtsDressing';
import { probeRoute, WALKUP_DWELL, WALKUP_HOLD } from './hubSolids';
import { returnSpawnFor, v1Spots } from './hubWorld';

/** venue.coastDoor: 1 = the boat to the coast at the landing (new); 0 = no boat, no card (the hub as before). */
export const VENICE_COAST_DOOR = 1;

/** The landing: the ring's centre on the sand band west of the courts, midway between the two rows (the open corridor), and the
 *  jetty running west from the rim to the water's edge (the hub's sea starts about 40 m out: courtsView's sand plane). [TUNE] */
// x −106: the ring's west edge (and its card's place) reaches the rim, so a walk that runs on past the ring stops at the rim
// still in the boat's place (door r4: at the rig's 2–3 frames a second the scripted walk ran 5.5 m on from −104 and the card went).
export const BOAT_STOP = { x: -106, z: -69 } as const;
export const JETTY = { x0: -110, x1: -152, halfW: 1.6, y: 0.5 } as const;

export const PIER_SPOT_ID = 'pier.end';

/** The pier end as the hub's walk-up spot: layout.ts's spot, at the landing for now. */
export function boatSpot(): Spot {
  const s = SPOTS.find((x) => x.id === PIER_SPOT_ID)!;
  return { ...s, label: '[PLACEHOLDER] The Boat to the Coast', at: [BOAT_STOP.x, BOAT_STOP.z], radius: RING.r + 1 };
}

/** In the boat's place: its ring, plus `grow` (the hold). */
export function inBoatPlace(x: number, z: number, grow = 0): boolean {
  return Math.hypot(x - BOAT_STOP.x, z - BOAT_STOP.z) <= RING.r + 1 + grow;
}

/** The courts' walk-up rule for the boat: dwell to show, hold to keep. */
export class BoatWalkup {
  private shown = false;
  private dwell = 0;
  readonly spot = boatSpot();
  step(dt: number, x: number, z: number): Spot | null {
    if (this.shown && inBoatPlace(x, z, WALKUP_HOLD)) return this.spot;
    this.shown = false;
    if (!inBoatPlace(x, z)) { this.dwell = 0; return null; }
    this.dwell += dt;
    if (this.dwell >= WALKUP_DWELL) { this.shown = true; this.dwell = 0; }
    return this.shown ? this.spot : null;
  }
}

/** Back from the coast (`?spot=pier.end`): just inland of the ring, facing the boat (west). */
export function boatReturnSpawn(): { pos: { x: number; y: number; z: number }; yaw: number } {
  const x = BOAT_STOP.x + RING.r + 3, z = BOAT_STOP.z;
  return { pos: { x, y: 0, z }, yaw: Math.atan2(BOAT_STOP.x - x, 0) };
}

/** The probes' walk to the boat (window.__VENICE__.walkTo('pier.end')): the courts' own probe route's first legs (the open
 *  corridor east of the nearest column of courts, down it to the gap between the two rows), then west along the gap into the
 *  ring (the courts' fences and the boardwalk row stay to either side). */
export function boatRoute(from: { x: number; z: number }, spots: readonly Spot[] = v1Spots()): Array<{ x: number; z: number }> {
  const [toCorridor, toGap] = probeRoute(spots, from, spots[0]);
  return [toCorridor, { x: toGap.x, z: BOAT_STOP.z }, { x: BOAT_STOP.x, z: BOAT_STOP.z }];
}

/** Where the hub puts you for a `?spot=` (null = its cold start at the court gate): beside a court for a court; at the boat for
 *  the pier end while the door is on (off: the cold start, as before the door). */
export function arrivalFor(back: string | null, doorOn: boolean): { pos: { x: number; y: number; z: number }; yaw: number } | null {
  if (back === PIER_SPOT_ID) return doorOn ? boatReturnSpawn() : null;
  return back ? returnSpawnFor(back) : null;
}
