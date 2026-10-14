// crowdVenues — where each mode's crowd sits (w3-crowds, A9.9). Data, plus the builders for venues laid out at runtime.
//
// Every stand here is one the venue already has (a painted grandstand, a racing-kit grandstand, a stadium bowl's lower
// tier, a ballpark's bleachers) or, where a venue has none, a small bleacher this module lays itself (`benches: true`) on
// ground the play never uses. Each venue names its CAMERA LINE (crowdLayout): no seat is laid between the play camera and
// the play, or behind it. `crowdVenues.test.ts` holds every venue to that, and to its tier's counts.
//
// Coordinates are the modes' own (read off their code and the venue specs, then checked on the capture rig).

import type { CrowdVenue, StandSpec, V3 } from './crowdLayout';
import type { PropPlacement } from '../venuePropSets';

export type CrowdVenueKey = 'football' | 'derby' | 'tennis' | 'volleyball' | 'threepoint' | 'dunk' | 'dunkduel' | 'penalty';

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

/** A PlacePack grandstand (venueSpecs `crowdTier`, NexusWebScene → PlacePack.buildCrowdStand): a 22 m sloped face from y 1.1
 *  at its front edge to 4.2 m, five rows of 1.1 m × 0.62 m, facing local +z. A seated fan's feet sit on the slope a little
 *  ahead of the row's middle (`SLOPE_FOOT`), so the front edge for row 0 is lifted that much up the slope. */
const SLOPE_FOOT = 0.18;
function placePackStand(id: string, at: [number, number], yaw: number, o: Partial<StandSpec> = {}): StandSpec {
  return { id, front: [at[0], 1.1 + SLOPE_FOOT * 0.62, at[1]], yaw, width: 21, rows: 5, step: [1.1, 0.62], posture: 'seated', pitch: 0.66, ...o };
}

/**
 * DERBY (Pro Diamond). The camera stands behind the plate (z −3.4) looking out; the outfield wall (z 24.6–38.3) is 6.5–9 m
 * tall, so the three spec grandstands behind it (venueSpecs derby: z 44 and the two at ±30, 30) are the HOMER's crowd —
 * seen from the flight camera and the replay, as the ball clears into them. Down both baselines, outside the six
 * Onlookers that flank the infield view (x ±6.5…11), a bleacher each side faces the infield: the crowd the batter swings
 * in front of. The Onlookers stay (they are the near crowd, full bodies).
 */
const DERBY: CrowdVenue = {
  stands: [
    placePackStand('db_center', [0, 44], PI),
    placePackStand('db_left', [-30, 30], PI * 0.75),
    placePackStand('db_right', [30, 30], -PI * 0.75),
    { id: 'db_first', front: [14.5, 0, 11], yaw: -PI / 2 - 0.35, width: 16, rows: 4, step: [0.7, 0.42], posture: 'seated', benches: true },
    { id: 'db_third', front: [-14.5, 0, 11], yaw: PI / 2 + 0.35, width: 16, rows: 4, step: [0.7, 0.42], posture: 'seated', benches: true },
  ],
  focus: [0, 1, 12],
  eye: [-1.8, 1.9, -3.4],
  camera: { at: [-1.8, 1.9, -3.4], into: [0, 1], margin: 6 },
};

/**
 * TENNIS (Center Court; Clay and the Lawn keep the same spec stands). The play camera stands behind the player's baseline
 * (z ≈ 15.8) looking −z: the far grandstand (z −28) is the crowd it plays toward, and two bleachers run down the sidelines
 * outside the ad boards and the cage's glass (x ±6.8) — in place of the eight sideline Onlookers. The near grandstand
 * (z +28) is behind the camera and stays painted.
 */
const TENNIS: CrowdVenue = {
  stands: [
    placePackStand('tn_far', [0, -28], 0),
    { id: 'tn_west', front: [-10.5, 0, -1], yaw: PI / 2, width: 20, rows: 4, step: [0.72, 0.42], posture: 'seated', benches: true },
    { id: 'tn_east', front: [10.5, 0, -1], yaw: -PI / 2, width: 20, rows: 4, step: [0.72, 0.42], posture: 'seated', benches: true },
  ],
  focus: [0, 1, -2],
  eye: [0, 4.4, 15.8],
  camera: { at: [0, 4.4, 15.8], into: [0, -1], margin: 5 },
};

/**
 * VOLLEYBALL (Beach Pro, Night Beach, the Gym). The court is 9 × 18 (x ±4.5, z ±9) with the beach flags at x ±6.8; the
 * camera stands behind the player's end (z ≈ 10.8) looking −z. The sand has no seating, so this lays beach bleachers:
 * one behind the far baseline and one down each sideline past the flags — in place of the eight Onlookers.
 */
const VOLLEYBALL: CrowdVenue = {
  stands: [
    { id: 'vb_far', front: [0, 0, -14], yaw: 0, width: 16, rows: 5, step: [0.72, 0.42], posture: 'seated', benches: true },
    { id: 'vb_west', front: [-8.6, 0, -1.5], yaw: PI / 2, width: 15, rows: 4, step: [0.72, 0.42], posture: 'seated', benches: true },
    { id: 'vb_east', front: [8.6, 0, -1.5], yaw: -PI / 2, width: 15, rows: 4, step: [0.72, 0.42], posture: 'seated', benches: true },
  ],
  focus: [0, 1, -2],
  eye: [0, 3.2, 10.8],
  camera: { at: [0, 3.2, 10.8], into: [0, -1], margin: 4.5 },
};

/**
 * 3-POINT CONTEST (Venice, the basketball_h2h court). The #220 corner camera stands at (13.3, 3.2, 7.1) looking across the
 * court toward −x, −z; past the far sideline is open sand to the palm row at x ≈ −14. A bleacher stands on that sand,
 * behind the lamp post (x −11), between the palms (z 0.5–10.5), facing the court — never behind the rim or the board.
 */
const THREEPOINT: CrowdVenue = {
  stands: [
    { id: 'tp_far', front: [-11.6, 0, 5.4], yaw: PI / 2, width: 10, rows: 3, step: [0.72, 0.42], posture: 'seated', benches: true },
  ],
  focus: [0, 1, 2],
  eye: [13.3, 3.2, 7.1],
  camera: { at: [13.3, 3.2, 7.1], into: [-0.86, -0.5], margin: 6 },
};

/**
 * THE DUNK (Venice Flight Night) and the DUEL on the same court. The camera stands at z ≈ 8–10 looking −z at the rim
 * (z −10.6); the boardwalk's baked crowd-card strip is at z −20. A standing crowd lines the boardwalk in front of it, in two
 * blocks either side of the rim's line (|x| ≥ 4: nothing moves behind the thing being aimed at). The court's sides stay
 * clear: the hoopbus and the event tent across the front corners are dunk surfaces (the wall run, the rebound).
 */
const VENICE_DUNK: CrowdVenue = {
  stands: [
    { id: 'dk_rail_w', front: [-9, 0, -17], yaw: 0.12, width: 10, rows: 3, step: [0.7, 0], posture: 'standing', pitch: 0.58 },
    { id: 'dk_rail_e', front: [9, 0, -17], yaw: -0.12, width: 10, rows: 3, step: [0.7, 0], posture: 'standing', pitch: 0.58 },
  ],
  focus: [0, 1.5, -8],
  eye: [0, 2.9, 8],
  camera: { at: [0, 2.9, 8], into: [0, -1], margin: 6 },
};

/**
 * PENALTY (the stadium bowl). The kicker's camera stands behind the spot (z −7.5) looking +z at the goal (line z 10.4,
 * posts ±3.66). Two stands FLANK the goal behind its line (QA P1-05: bodies straight behind the goal mouth read as more
 * keepers), from 2.3 m outside each post, 2.2 m behind the keeper-round camera (z 13.4) as the Onlookers they replace were.
 */
const PENALTY: CrowdVenue = {
  stands: [
    { id: 'pn_left', front: [-12, 0, 15.6], yaw: PI, width: 12, rows: 5, step: [0.75, 0.45], posture: 'seated', benches: true },
    { id: 'pn_right', front: [12, 0, 15.6], yaw: PI, width: 12, rows: 5, step: [0.75, 0.45], posture: 'seated', benches: true },
  ],
  focus: [0, 1, 8],
  eye: [0, 3.4, -7.5],
  camera: { at: [0, 3.4, -7.5], into: [0, 1], margin: 8 },
};

const VENUES: Record<CrowdVenueKey, CrowdVenue> = {
  football: FOOTBALL,
  derby: DERBY,
  tennis: TENNIS,
  volleyball: VOLLEYBALL,
  threepoint: THREEPOINT,
  dunk: VENICE_DUNK,
  dunkduel: { ...VENICE_DUNK, eye: [0, 3.6, 10.4], camera: { at: [0, 3.6, 10.4], into: [0, -1], margin: 6 } },
  penalty: PENALTY,
};

export const CROWD_VENUE_KEYS = Object.keys(VENUES) as CrowdVenueKey[];

/** The venue for a mode (a `variant` picks a place's own layout where a mode has several). */
export function crowdVenue(key: CrowdVenueKey, variant?: string): CrowdVenue | null {
  void variant;
  return VENUES[key] ?? null;
}

/** The racing kit's grandstands (Kenney `grandStand`, `grandStandCovered`): a 1 × 1 unit footprint, seats rising from the
 *  front edge (model z 0, y 0.21) back to z −0.49 (y 0.63) — three seated rows of 0.163 × 0.14 units — facing model +z.
 *  VenueProps places each with its holder's yaw and scale and ignores the file's root node, so model space maps straight
 *  through the placement. The round stands curve: they keep their painted look. */
export const KART_STAND_MODELS = ['grandStand', 'grandStandCovered'];
const KIT_ROW = [0.163, 0.14], KIT_FRONT_Y = 0.227, KIT_SEAT_X = 0.5, KIT_WIDTH = 0.86;

/**
 * VELOCITY KART. The seats are the circuit's own grandstands (kartDressing.kartSceneryFor), wherever the course put them;
 * `groundY` is the course's relief (the props snap onto it). There is no single play camera — it follows the kart round the
 * whole loop — so the line is set past every stand: each stands ≥ 16 m off the road's edge (kartSceneryFor's own offset).
 */
export function kartCrowdVenue(placements: readonly PropPlacement[], groundY: ((x: number, z: number) => number) | null = null, eye: V3 = [0, 3, 0]): CrowdVenue {
  const stands: StandSpec[] = [];
  placements.forEach((p, i) => {
    if (!KART_STAND_MODELS.includes(p.model)) return;
    const s = p.scale ?? 1, yaw = p.yaw ?? 0, c = Math.cos(yaw), sn = Math.sin(yaw);
    const lx = KIT_SEAT_X * s;   // the seats' middle, across the stand
    const x = p.at[0] + lx * c, z = p.at[2] - lx * sn;
    const gy = (groundY?.(p.at[0], p.at[2]) ?? 0) + p.at[1];
    stands.push({ id: `vk_${i}`, front: [x, gy + KIT_FRONT_Y * s, z], yaw, width: KIT_WIDTH * s, rows: 3, step: [KIT_ROW[0] * s, KIT_ROW[1] * s], posture: 'seated', pitch: 0.6, gaps: 0.05 });
  });
  return { stands, focus: eye, eye, camera: { at: [0, 0, -1e6], into: [0, 1], margin: 0 } };
}
