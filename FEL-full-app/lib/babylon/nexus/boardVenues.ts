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
}

// ── SKATE ────────────────────────────────────────────────────────────────────────────────────────────────
// Three genuinely different places rather than three tints of one. Venice is warm concrete under a low sun;
// the plaza is cold granite and painted kerbs at midday; the warehouse is dark with one hot light and sodium edges.
export const SKATE_VENUES: readonly BoardVenue[] = [
  {
    id: 'venice-park', name: 'VENICE PARK', sub: 'Warm concrete, low sun, the boardwalk behind you.',
    discipline: 'skate', bound: 56, mood: 'goldenHour', sky: 'venice', crowd: 8, ready: true,
    palette: { ground: '#b8a48c', line: '#f4ead8', structure: '#8d7f6d', accent: '#ff8a3d', edge: '#4a4038', backdrop: '#f0a675' },
  },
  {
    id: 'city-plaza', name: 'CITY PLAZA', sub: 'Granite ledges, painted kerbs, hard midday light.',
    discipline: 'skate', bound: 62, mood: 'daylight', sky: 'stadium', crowd: 10, ready: true,
    palette: { ground: '#9aa3ad', line: '#eef2f6', structure: '#6d7681', accent: '#22d3ee', edge: '#2b323a', backdrop: '#c7d3de' },
  },
  {
    id: 'warehouse', name: 'THE WAREHOUSE', sub: 'Poured concrete, sodium light, nobody to tell you to leave.',
    discipline: 'skate', bound: 48, mood: 'nightGame', sky: 'stadium', crowd: 5, ready: true,
    palette: { ground: '#4c4a52', line: '#ffd75e', structure: '#3a3841', accent: '#ff4d6d', edge: '#23222a', backdrop: '#14131a' },
  },
];

// ── SNOW ─────────────────────────────────────────────────────────────────────────────────────────────────
export const SNOW_VENUES: readonly BoardVenue[] = [
  {
    id: 'alpine-run', name: 'ALPINE RUN', sub: 'Blue shadows on white, pines to the treeline.',
    discipline: 'snow', bound: 24, mood: 'alpine', sky: 'alpine', crowd: 8, trees: 22, ready: true,
    palette: { ground: '#eef4fb', line: '#9fc0e8', structure: '#dce8f6', accent: '#ff4d6d', edge: '#7f97b5', backdrop: '#9dbfe0' },
  },
  {
    id: 'night-park', name: 'NIGHT PARK', sub: 'Floodlit kickers, everything else is dark.',
    discipline: 'snow', bound: 20, mood: 'nightGame', sky: 'alpine', crowd: 6, trees: 14, ready: true,
    palette: { ground: '#c6d3e4', line: '#ffd75e', structure: '#9fb0c6', accent: '#4dd4ff', edge: '#2b3648', backdrop: '#141b28' },
  },
  {
    id: 'glacier', name: 'GLACIER', sub: 'Above the trees. Ice blue, flat light, a long way down.',
    discipline: 'snow', bound: 34, mood: 'overcast', sky: 'alpine', crowd: 3, trees: 0, ready: true,
    palette: { ground: '#e6f2f8', line: '#7fb8d4', structure: '#cfe4ef', accent: '#2ec4b6', edge: '#6a8ea3', backdrop: '#c3dbe8' },
  },
];

// ── SURF ─────────────────────────────────────────────────────────────────────────────────────────────────
export const SURF_VENUES: readonly BoardVenue[] = [
  {
    id: 'the-break', name: 'THE BREAK', sub: 'Green water, a pier down the line, afternoon glass.',
    discipline: 'surf', bound: 70, mood: 'daylight', sky: 'ocean', crowd: 6, ready: true,
    palette: { ground: '#2f8f8a', line: '#bfeee9', structure: '#1f6f6b', accent: '#ffd75e', edge: '#134f4c', backdrop: '#8fd6cf' },
  },
  {
    id: 'sunset-point', name: 'SUNSET POINT', sub: 'Gold on the face, long walls, nobody out.',
    discipline: 'surf', bound: 78, mood: 'goldenHour', sky: 'ocean', crowd: 3, ready: true,
    palette: { ground: '#2b6f86', line: '#ffd9a8', structure: '#1d5468', accent: '#ff8a3d', edge: '#123a48', backdrop: '#f0a675' },
  },
  {
    id: 'reef', name: 'THE REEF', sub: 'Dark water over coral. It breaks hard and it breaks shallow.',
    discipline: 'surf', bound: 64, mood: 'overcast', sky: 'ocean', crowd: 2, ready: true,
    palette: { ground: '#1f5d70', line: '#9fd6e8', structure: '#164654', accent: '#b07cf5', edge: '#0d2f39', backdrop: '#6f9db0' },
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
