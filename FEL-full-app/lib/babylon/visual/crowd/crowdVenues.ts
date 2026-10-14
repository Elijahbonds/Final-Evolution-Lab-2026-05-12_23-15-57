// crowdVenues — where each mode's crowd sits (w3-crowds, A9.9). Data, plus the builders for venues laid out at runtime.
//
// Every stand here is one the venue already has (a painted grandstand, a racing-kit grandstand, a stadium bowl's lower
// tier, a ballpark's bleachers) or, where a venue has none, a small bleacher this module lays itself (`benches: true`) on
// ground the play never uses. Each venue names its CAMERA LINE (crowdLayout): no seat is laid between the play camera and
// the play, or behind it. `crowdVenues.test.ts` holds every venue to that, and to its tier's counts.
//
// Coordinates are the modes' own (read off their code and the venue specs, then checked on the capture rig).

import type { CrowdVenue, StandSpec } from './crowdLayout';

export type CrowdVenueKey = 'football';

const PI = Math.PI;

/**
 * FOOTBALL RUSH. The field is x −20..20, the drive runs +z from the scrimmage line to the goal at z 40 and the end zone to
 * 45; the gridiron box's painted walls stand at x ±24 and z ±47 (VenueKit.buildGridiron). The runner-cam trails the runner
 * (−z) and always looks +z, so the crowd is the END-ZONE stand the play runs at — three rows of bleachers between the end
 * line and the far wall — and the two sideline stands in the 4 m between the touchline and the side walls, from the
 * 10-yard line on (the camera starts a drive 18 m behind the runner at the 0). These replace the 16 sideline Onlookers.
 */
const FOOTBALL: CrowdVenue = {
  stands: [
    { id: 'fb_end', front: [0, 0, 45.35], yaw: PI, width: 44, rows: 3, step: [0.6, 0.42], posture: 'seated', benches: true },
    { id: 'fb_west', front: [-21.9, 0, 26], yaw: PI / 2, width: 36, rows: 3, step: [0.6, 0.42], posture: 'seated', benches: true },
    { id: 'fb_east', front: [21.9, 0, 26], yaw: -PI / 2, width: 36, rows: 3, step: [0.6, 0.42], posture: 'seated', benches: true },
  ] satisfies StandSpec[],
  focus: [0, 1, 30],
  eye: [0, 4.3, 32],
  camera: { at: [0, 4.3, -18], into: [0, 1], margin: 22 },
};

const VENUES: Record<CrowdVenueKey, CrowdVenue> = {
  football: FOOTBALL,
};

export const CROWD_VENUE_KEYS = Object.keys(VENUES) as CrowdVenueKey[];

/** The venue for a mode (a `variant` picks a place's own layout where a mode has several). */
export function crowdVenue(key: CrowdVenueKey, variant?: string): CrowdVenue | null {
  void variant;
  return VENUES[key] ?? null;
}
