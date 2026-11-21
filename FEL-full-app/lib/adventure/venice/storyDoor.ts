/**
 * VENICE ↔ THE STORY: the story gate, the hub's side (lane/story, 2026-11-21; docs/STORY-FINISH-PLAN.md). The owner chose Venice as
 * the Adventure's hub (2026-11-17, default 2) and asked for the story to be finished (2026-11-21). The plan's full step — the
 * story's hub gates becoming Venice doors and Chapter 1's world placed in a zone — is VENICE-HUB-PLAN V6 (XL, art and names). Until
 * then this is the door between the two places that exist: a gate on the sand east of the courts, mirroring the boat to the coast
 * on the west (coastDoor.ts). Step into its ring and the courts' walk-up rule brings up a card, "The Story", with one button that
 * opens the Adventure's story (`/play/adventure?from=venice`). The story's way out ("Back to Venice") opens `/play/venice?spot=story.gate`
 * and the hub lands you beside the gate, facing it.
 *
 * Behind the knob `venue.storyDoor` (1; 0 = no gate, no card, and `?spot=story.gate` lands at the court gate as before).
 * assumption: the gate's place [TUNE]: the bike path's sand east of the courts, midway between the two rows (the open corridor), its
 * ring reaching to a metre inside the rim so a walk that runs on stops at the rim still in the gate's place (the boat's lesson).
 * Pure: no Babylon.
 */

import type { Spot } from './layout';
import { RING } from './courtsDressing';
import { probeRoute, WALKUP_DWELL, WALKUP_HOLD } from './hubSolids';
import { v1Spots } from './hubWorld';

/** venue.storyDoor: 1 = the story gate east of the courts (new); 0 = no gate, no card (the hub as before). */
export const VENICE_STORY_DOOR = 1;

export const STORY_SPOT_ID = 'story.gate';
/** The Adventure's story route, as the Play tab's Story door opens it (lib/nav/doors.ts). */
export const STORY_ROUTE = '/play/adventure';
export const VENICE_ROUTE = '/play/venice';

/** The gate's ring centre: the sand east of the courts (the hub's walkable rim is x 46), in the gap between the two rows. [TUNE] */
export const STORY_GATE = { x: 42, z: -69 } as const;
/** The gate's frame, drawn just past the ring (east), facing west to the courts. [TUNE] */
export const STORY_ARCH = { x: 44.6, halfW: 2.4, h: 4.6 } as const;

/** The gate as the hub's walk-up spot (its card's label and the ring's reach). Names are the owner's: `[PLACEHOLDER]`. */
export function storyGateSpot(): Spot {
  return { id: STORY_SPOT_ID, label: '[PLACEHOLDER] The Story Gate', district: 'courts', at: [STORY_GATE.x, STORY_GATE.z], radius: RING.r + 1, modes: [], route: STORY_ROUTE, kind: 'wilds' };
}

export function inStoryPlace(x: number, z: number, grow = 0): boolean {
  return Math.hypot(x - STORY_GATE.x, z - STORY_GATE.z) <= RING.r + 1 + grow;
}

/** The courts' walk-up rule for the gate: dwell to show, hold to keep. */
export class StoryWalkup {
  private shown = false;
  private dwell = 0;
  readonly spot = storyGateSpot();
  step(dt: number, x: number, z: number): Spot | null {
    if (this.shown && inStoryPlace(x, z, WALKUP_HOLD)) return this.spot;
    this.shown = false;
    if (!inStoryPlace(x, z)) { this.dwell = 0; return null; }
    this.dwell += dt;
    if (this.dwell >= WALKUP_DWELL) { this.shown = true; this.dwell = 0; }
    return this.shown ? this.spot : null;
  }
}

/** Back from the story (`?spot=story.gate`): just inland of the ring (west of it), facing the gate (east). */
export function storyReturnSpawn(): { pos: { x: number; y: number; z: number }; yaw: number } {
  const x = STORY_GATE.x - RING.r - 3, z = STORY_GATE.z;
  return { pos: { x, y: 0, z }, yaw: Math.atan2(STORY_GATE.x - x, 0) };
}

/** The probes' walk to the gate (window.__VENICE__.walkTo('story.gate')): the courts' probe route's first legs (the open corridor east of
 *  the nearest column of courts, down it to the gap between the rows), then east along the gap into the ring. */
export function storyRoute(from: { x: number; z: number }, spots: readonly Spot[] = v1Spots()): Array<{ x: number; z: number }> {
  const [toCorridor] = probeRoute(spots, from, spots[0]);
  return [toCorridor, { x: toCorridor.x, z: STORY_GATE.z }, { x: STORY_GATE.x, z: STORY_GATE.z }];
}

/** The card's button: the Adventure's story, told it came from Venice (its way out comes back here). */
export function storyEntryHref(): string { return `${STORY_ROUTE}?from=venice`; }

/** The story's way out: back to the gate when it was opened from Venice, else the Play tab. */
export function storyExitFor(search: string | null | undefined): { href: string; label: string; venice: boolean } {
  let from: string | null = null;
  try { from = new URLSearchParams(search ?? '').get('from'); } catch { from = null; }
  return from === 'venice'
    ? { href: `${VENICE_ROUTE}?spot=${STORY_SPOT_ID}`, label: 'Back to Venice', venice: true }
    : { href: '/play', label: 'Back to Play', venice: false };
}
