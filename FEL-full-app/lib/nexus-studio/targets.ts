// PLAY-TEST TARGETS (docs/NEXUS-STUDIO.md §5): the modes that can load a Studio venue, and what the editor needs to know
// about each — the venue spec it mounts, where its hero stands and its camera looks, its weather family, the crowd look
// line, and the budget row it is measured against.
//
// One target today, by the brief: Tiebreak (non-hoops, a spec-mounted court with a place look, its file > 24 h old).
// A mode joins by reading `studioVenueFor('<key>')` in its definition (see TiebreakMode.ts) and adding a row here.

import type { V3 } from './doc';

export interface PlaytestTarget {
  /** The registry key (lib/babylon/modes/registry.ts) and `studioVenueFor`'s key. */
  key: string;
  label: string;
  /** The venue spec the mode mounts (nexus/venueSpecs.ts). */
  spec: string;
  /** Where the mode's hero stands (the intro and replay previews frame it) and who it plays toward. */
  subject: V3;
  /** The hero's facing on that spot (radians; the cast preview stands it so). */
  subjectYaw: number;
  objective: V3;
  /** CameraDirector preset the mode plays on. */
  camPreset: 'court';
  /** nexus/weather.ts family (what the weather picker offers). */
  weatherFamily: 'court';
  /** crowdLayout.CrowdVenue's look line for this mode's play camera (a stand may not sit in front of it or behind it). */
  crowdView: { focus: V3; eye: V3; camera: { at: V3; into: [number, number]; margin: number } };
  /** config/mobileBudget.json row measured on this venue (the mode's own, or the closest one). */
  budgetKey: string;
  /** Opens the mode with a Studio venue: dev only (the load path is dev only). */
  route(venueParam: string): string;
}

export const PLAYTEST_TARGETS: Record<string, PlaytestTarget> = {
  tiebreak: {
    key: 'tiebreak',
    label: 'Tiebreak',
    spec: 'tennis',
    subject: [0, 0, 10],     // core/TiebreakFlight NEAR_Z
    subjectYaw: Math.PI,     // TiebreakMode PLAYER_YAW
    objective: [0.4, 0, -10], // FAR_Z, the rival's spot
    camPreset: 'court',
    weatherFamily: 'court',
    // visual/crowd/crowdVenues.ts TENNIS: the play camera stands behind the near baseline looking −z
    crowdView: { focus: [0, 1, -2], eye: [0, 4.4, 15.8], camera: { at: [0, 4.4, 15.8], into: [0, -1], margin: 5 } },
    budgetKey: 'tennis',
    route: (v) => `/dev/mode/tiebreak?venue=${encodeURIComponent(v)}`,
  },
};

export const DEFAULT_TARGET = 'tiebreak';

export function targetOf(key: string): PlaytestTarget | null { return PLAYTEST_TARGETS[key] ?? null; }
