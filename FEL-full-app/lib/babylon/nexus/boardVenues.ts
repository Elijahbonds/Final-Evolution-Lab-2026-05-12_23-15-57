// BOARD VENUES — different places to ride, and places that look like places (2026-09-12).
//
// Owner: "fix how the environment looks for the board sports", "different venues", "add art and life like we did to
// the dunk mode", "quality product production", "lets fix the world size issue too".
//
// WHAT THE SCREENSHOTS SHOWED, before any of this. The skatepark is one 70x70 slab holding five ramps, a bowl, a
// downhill lane and two funboxes — and every single surface is a shade of the same grey-purple:
//
//     ground #8d8496 · ramps #6f6680 · bowl #5f5670 · lane #79708a · boxes #5a5266 · fence #3c3947
//
// Six materials, one value, no contrast. That is why it reads washed-out next to the snow run, which has green trees
// against white snow against a blue mountain. It is not a lighting problem or a texture-resolution problem; the place
// has no palette. And the rider crosses the whole park in EIGHT SECONDS at ride speed, so what little there is goes by
// before it registers.
//
// So a venue here is a PALETTE plus an EXTENT plus a mood, the way the hoops court locations are (courtLocations.ts).
// Data, so a new venue is a list entry rather than a code path, and so the three disciplines stop each inventing their
// own idea of what a place is.

import type { VenueMood } from '../scene/moods';
import type { BackdropFamily } from '../visual/Backdrops';

export type BoardDiscipline = 'skate' | 'snow' | 'surf';

export interface VenuePalette {
  /** The riding surface. */
  ground: string;
  /** Markings painted on it. */
  line: string;
  /** Ramps, banks, lips — the things you ride ON. */
  structure: string;
  /** The one colour that is allowed to shout. */
  accent: string;
  /** Edges, fences, rails. */
  edge: string;
  /** What sits behind the place. */
  backdrop: string;
}

export interface BoardVenue {
  id: string;
  name: string;
  /** One line on the picker. */
  sub: string;
  discipline: BoardDiscipline;
  palette: VenuePalette;
  /** Half-extent of the rideable world, metres. The fence and the clamp both read this one number. */
  bound: number;
  /**
   * The mood the light rig should run — in the RIG'S OWN vocabulary (scene/moods.ts), deliberately.
   *
   * The first cut of this file had its own words ('sunset', 'night'), which meant a translation table
   * between venue moods and rig moods, which meant two places to keep in step and a silent fallback when
   * they drifted. The venue now names a mood the rig already has, so a venue that names a mood that does
   * not exist is a TYPE ERROR rather than a scene that renders under the wrong sky.
   */
  mood: VenueMood;
  /**
   * What is painted BEHIND the place.
   *
   * Separate from the mood because the two are genuinely independent: the glacier and the reef run the same
   * flat overcast light over completely different horizons (a ridge line vs open water). Mapping backdrop
   * from mood alone is what left the 'ocean' family — a painted sea, a pier, palms — mounted by nothing at
   * all, while every surf break sat under Venice's city skyline.
   */
  sky: BackdropFamily;
  /** Bodies watching. A place with nobody in it is a level, not a place. */
  crowd: number;
  /**
   * SNOW ONLY: pines beside the run. Zero is a real answer — the glacier's own line is "above the trees",
   * and a venue whose copy says that and then grows a treeline is lying to the player.
   */
  trees?: number;
  ready: boolean;
  /**
   * HOW THE PLACE RIDES (2026-09-13).
   *
   * Everything above this line is how a venue LOOKS. That was the whole record: palette, mood, sky, crowd,
   * trees — and `bound`, the only field that touched play. So three genuinely different-looking places rode
   * identically, and the copy was writing cheques the physics did not honour. "Granite ledges" skated like
   * warm Venice concrete. The glacier, whose own line is "a long way down", descended at the same pitch as
   * the alpine run. The reef "breaks hard and it breaks shallow" and broke exactly like an afternoon point.
   *
   * `ride` is that promise kept. It is optional so a venue may still be authored visuals-first, and every
   * field is a MULTIPLIER on the discipline's tuning rather than an absolute — a venue describes how it
   * differs from the norm, it does not re-specify the sport.
   */
  ride?: RideCharacter;
}

/**
 * A venue's physical character, as multipliers on the discipline's own tuning.
 *
 * All default to 1 (or 0 for the additive ones), so an unauthored venue rides exactly as the sport does and
 * nothing changes underneath the modes that have not opted in.
 */
export interface RideCharacter {
  /** Grip underfoot. Below 1 is slick — granite, ice, wet reef. Above 1 bites. */
  grip?: number;
  /** Top speed the place allows. Long open walls above 1; tight technical places below. */
  speed?: number;
  /** How hard it is to hold a carve. Below 1 washes out. */
  carve?: number;
  /** SNOW: the pitch of the run, as a multiple of SLOPE_PITCH. Steeper is faster and less forgiving. */
  pitch?: number;
  /** SNOW: gate spacing, as a multiple of SLALOM_SPACING. Tighter demands more turn. */
  gateSpacing?: number;
  /** SURF: wave height, as a multiple of WAVE_HEIGHT. */
  waveHeight?: number;
  /** SURF: how fast the wall runs, as a multiple of WAVE_SPEED. A fast wall is a hard wall. */
  wavePeriod?: number;
  /** SKATE: obstacle density, as a multiple of the venue's default furniture count. */
  density?: number;
  /** How punishing a mistake is here — a shallow reef and a floodlit park are not the same fall. */
  hazard?: number;
}

/** Every multiplier at its neutral value: the sport exactly as tuned. */
export const NEUTRAL_RIDE: Required<RideCharacter> = {
  grip: 1, speed: 1, carve: 1, pitch: 1, gateSpacing: 1,
  waveHeight: 1, wavePeriod: 1, density: 1, hazard: 1,
};

/** A venue's ride with every gap filled from neutral, so callers never branch on undefined. */
export function rideOf(venue: BoardVenue): Required<RideCharacter> {
  return { ...NEUTRAL_RIDE, ...(venue.ride ?? {}) };
}

// ── SKATE ────────────────────────────────────────────────────────────────────────────────────────────────
// Three genuinely different places rather than three tints of one. Venice is warm concrete under a low sun;
// the plaza is cold granite and painted kerbs at midday; the warehouse is dark with one hot light and sodium edges.
export const SKATE_VENUES: readonly BoardVenue[] = [
  {
    id: 'venice-park', name: 'VENICE PARK', sub: 'Warm concrete, low sun, the boardwalk behind you.',
    discipline: 'skate', bound: 56, mood: 'goldenHour', sky: 'venice', crowd: 8, ready: true,
    palette: { ground: '#b8a48c', line: '#f4ead8', structure: '#8d7f6d', accent: '#ff8a3d', edge: '#4a4038', backdrop: '#f0a675' },
    // warm, slightly rough concrete: it grips, and the park is busy with furniture
    ride: { grip: 1.08, speed: 0.97, density: 1.15, hazard: 0.9 },
  },
  {
    id: 'city-plaza', name: 'CITY PLAZA', sub: 'Granite ledges, painted kerbs, hard midday light.',
    discipline: 'skate', bound: 62, mood: 'daylight', sky: 'stadium', crowd: 10, ready: true,
    palette: { ground: '#9aa3ad', line: '#eef2f6', structure: '#6d7681', accent: '#22d3ee', edge: '#2b323a', backdrop: '#c7d3de' },
    // granite is FAST and slick — the copy says granite, so it skates like granite
    ride: { grip: 0.86, speed: 1.1, carve: 0.92, density: 0.85, hazard: 1.0 },
  },
  {
    id: 'warehouse', name: 'THE WAREHOUSE', sub: 'Poured concrete, sodium light, nobody to tell you to leave.',
    discipline: 'skate', bound: 48, mood: 'nightGame', sky: 'stadium', crowd: 5, ready: true,
    palette: { ground: '#4c4a52', line: '#ffd75e', structure: '#3a3841', accent: '#ff4d6d', edge: '#23222a', backdrop: '#14131a' },
    // poured concrete indoors: the best surface here, in the smallest space, in the dark
    ride: { grip: 1.12, speed: 1.0, density: 1.3, hazard: 1.1 },
  },
];

// ── SNOW ─────────────────────────────────────────────────────────────────────────────────────────────────
export const SNOW_VENUES: readonly BoardVenue[] = [
  {
    id: 'alpine-run', name: 'ALPINE RUN', sub: 'Blue shadows on white, pines to the treeline.',
    discipline: 'snow', bound: 24, mood: 'alpine', sky: 'alpine', crowd: 8, trees: 22, ready: true,
    palette: { ground: '#eef4fb', line: '#9fc0e8', structure: '#dce8f6', accent: '#ff4d6d', edge: '#7f97b5', backdrop: '#9dbfe0' },
    // the reference run: everything else is described against this
    ride: { },
  },
  {
    id: 'night-park', name: 'NIGHT PARK', sub: 'Floodlit kickers, everything else is dark.',
    discipline: 'snow', bound: 20, mood: 'nightGame', sky: 'alpine', crowd: 6, trees: 14, ready: true,
    palette: { ground: '#c6d3e4', line: '#ffd75e', structure: '#9fb0c6', accent: '#4dd4ff', edge: '#2b3648', backdrop: '#141b28' },
    // groomed and tight under the lights — good grip, short gaps, and you cannot see the fall
    ride: { grip: 1.06, gateSpacing: 0.85, speed: 0.95, hazard: 1.15 },
  },
  {
    id: 'glacier', name: 'GLACIER', sub: 'Above the trees. Ice blue, flat light, a long way down.',
    discipline: 'snow', bound: 34, mood: 'overcast', sky: 'alpine', crowd: 3, trees: 0, ready: true,
    palette: { ground: '#e6f2f8', line: '#7fb8d4', structure: '#cfe4ef', accent: '#2ec4b6', edge: '#6a8ea3', backdrop: '#c3dbe8' },
    // "a long way down": the steepest pitch, ice underfoot, gates strung out wide
    ride: { pitch: 1.28, grip: 0.82, gateSpacing: 1.2, speed: 1.12, carve: 0.9, hazard: 1.2 },
  },
];

// ── SURF ─────────────────────────────────────────────────────────────────────────────────────────────────
// SURF OCEAN (owner 2026-09-15, "expand the map"): each break is ~40 % wider to ride (70/78/64 → 100/110/92 half-width) — the wave
// ribbon, the collider and the clamp all read `bound`, and the living sea runs to the horizon around it (visual/OceanSurface).
export const SURF_VENUES: readonly BoardVenue[] = [
  {
    id: 'the-break', name: 'THE BREAK', sub: 'Green water, a pier down the line, afternoon glass.',
    discipline: 'surf', bound: 100, mood: 'daylight', sky: 'ocean', crowd: 6, ready: true,
    palette: { ground: '#2f8f8a', line: '#bfeee9', structure: '#1f6f6b', accent: '#ffd75e', edge: '#134f4c', backdrop: '#8fd6cf' },
    // the reference wave: afternoon glass, honest and mid-sized
    ride: { },
  },
  {
    id: 'sunset-point', name: 'SUNSET POINT', sub: 'Gold on the face, long walls, nobody out.',
    discipline: 'surf', bound: 110, mood: 'goldenHour', sky: 'ocean', crowd: 3, ready: true,
    palette: { ground: '#2b6f86', line: '#ffd9a8', structure: '#1d5468', accent: '#ff8a3d', edge: '#123a48', backdrop: '#f0a675' },
    // "long walls": a slower, longer wave — more room to work, less punch
    ride: { waveHeight: 0.88, wavePeriod: 0.85, speed: 0.95, carve: 1.08, hazard: 0.8 },
  },
  {
    id: 'reef', name: 'THE REEF', sub: 'Dark water over coral. It breaks hard and it breaks shallow.',
    discipline: 'surf', bound: 92, mood: 'overcast', sky: 'ocean', crowd: 2, ready: true,
    palette: { ground: '#1f5d70', line: '#9fd6e8', structure: '#164654', accent: '#b07cf5', edge: '#0d2f39', backdrop: '#6f9db0' },
    // "it breaks hard and it breaks shallow" — the biggest, fastest wave and the worst place to fall
    ride: { waveHeight: 1.35, wavePeriod: 1.25, speed: 1.15, grip: 0.9, carve: 0.94, hazard: 1.6 },
  },
];

export const VENUES_BY_DISCIPLINE: Readonly<Record<BoardDiscipline, readonly BoardVenue[]>> = {
  skate: SKATE_VENUES, snow: SNOW_VENUES, surf: SURF_VENUES,
};

export function allBoardVenues(): BoardVenue[] {
  return [...SKATE_VENUES, ...SNOW_VENUES, ...SURF_VENUES];
}

export function venueById(id: string): BoardVenue | null {
  return allBoardVenues().find((v) => v.id === id) ?? null;
}

/** Venues the picker offers for a discipline. */
export function readyVenues(d: BoardDiscipline): BoardVenue[] {
  return VENUES_BY_DISCIPLINE[d].filter((v) => v.ready);
}

export const VENUE_KEY_PREFIX = 'fel-board-venue-';

/** The player's pick: `?venue=` wins, then the remembered pick, then the discipline's first. */
export function readBoardVenue(d: BoardDiscipline): BoardVenue {
  const list = readyVenues(d);
  const first = list[0] ?? VENUES_BY_DISCIPLINE[d][0];
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('venue');
      const byQuery = list.find((v) => v.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(VENUE_KEY_PREFIX + d);
      const byStore = list.find((v) => v.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: the default */ }
  return first;
}

export function writeBoardVenue(d: BoardDiscipline, id: string): void {
  try { window.localStorage.setItem(VENUE_KEY_PREFIX + d, id); } catch { /* convenience only */ }
}

/**
 * How much bigger this venue is than the one fixed world its discipline used to have.
 *
 * Per discipline, because `bound` is a half-extent of DIFFERENT things and comparing them to one number would be
 * meaningless: the skate bound is half a square slab (was 33, and a rider crossed it in EIGHT SECONDS — measured),
 * the snow bound is half the groomed corridor's WIDTH (was PISTE_HALF_WIDTH 17; the length comes from the gate
 * course), and the surf bound is half the surfable water's width (was SURF_HALF_WIDTH 45).
 *
 * Every venue grows on its own baseline. The tight ones are tight on purpose — the warehouse and the night park are
 * small places, and a floor under the growth is what keeps "deliberately tight" from sliding back to "cramped".
 */
export const LEGACY_BOUND: Readonly<Record<BoardDiscipline, number>> = { skate: 33, snow: 17, surf: 45 };
/** Kept for the skate tests that named it before the other two disciplines had venues. */
export const LEGACY_PARK_BOUND = LEGACY_BOUND.skate;
export function boundGrowth(v: BoardVenue): number { return v.bound / LEGACY_BOUND[v.discipline]; }


/**
 * Apply a venue's character to a discipline's tuning.
 *
 * The multipliers land on the three numbers a rider actually feels — top speed, how hard a carve turns, and
 * how much speed a non-carved steer scrubs off. Grip is deliberately spent on scrub rather than on turn
 * rate: a slick surface does not stop you turning, it stops the turn HOLDING, which is what washing out is.
 *
 * Pure, and it returns a new object — a mode that applied this to its module-level tuning in place would
 * compound the venue every time the mode remounted.
 */
export function tuneForVenue<T extends { maxSpeed: number; carveTurnRate: number; carveHold: number; scrubRate: number }>(
  tuning: T, venue: BoardVenue,
): T {
  const r = rideOf(venue);
  return {
    ...tuning,
    maxSpeed: tuning.maxSpeed * r.speed,
    carveTurnRate: tuning.carveTurnRate * r.carve,
    carveHold: 1 + (tuning.carveHold - 1) * r.grip,
    scrubRate: tuning.scrubRate / Math.max(0.2, r.grip),
  };
}
