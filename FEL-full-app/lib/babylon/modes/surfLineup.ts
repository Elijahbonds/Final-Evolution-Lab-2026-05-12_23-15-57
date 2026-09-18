// SURF LINEUP — sets, swells, and the sections of a wave.
//
// Phase 1 measured surf as the emptiest world in the project: zero grind lines, zero markers, and a trick table
// that is three manual, two revert and three air. The audit's own words for the older version of this mode were
// "nothing to pick up, nothing to fire, nothing to dodge, no reason to take one line over another" — and the fix
// it got was items and rivals. What it still did not have is the thing an actual surf break has: DIFFERENT WAVES.
//
// One wave profile means every ride is the same ride. The owner's call (2026-09-17) was both halves of the ask:
// more waves in the water at once, AND waves that differ. So:
//
//   A WAVE has a profile — how big, how fast it peels, whether it throws a barrel, and how long the rideable
//   wall is before it closes out. Three profiles minimum, and they are genuinely different rides rather than one
//   ride at three sizes.
//
//   A WAVE HAS SECTIONS — takeoff, wall, barrel (when it throws) and close-out — each a range along the ride, so
//   there is something to aim AT rather than a single undifferentiated face. This is what surf was missing that
//   skate has fourteen of: places on the terrain that ask for something specific.
//
//   A SET is several waves on a rhythm, then a LULL. Real lineups arrive in sets, and the lull is what makes
//   choosing a wave a decision — pass on a small one and you wait.
//
//   THE LINEUP holds several swells at once at different distances from shore, so the water reads as an ocean
//   with more coming rather than one wave and a flat horizon.
//
// Pure: numbers and names. No scene, no meshes. The break builder and the mode read it.

export type WaveShape = 'mellow' | 'punchy' | 'barreling';
export type SectionKind = 'takeoff' | 'wall' | 'barrel' | 'closeout';

export interface WaveProfile {
  id: string;
  label: string;
  shape: WaveShape;
  /** Face height, metres. */
  height: number;
  /** How fast the break peels along the beach, m/s — the wall's own speed, which is what you must keep up with. */
  peel: number;
  /** Rideable length before it closes out, metres. */
  wall: number;
  /** Does it throw a barrel, and over what fraction of the wall. 0 = never. */
  barrel: number;
  /** Multiplier on everything scored on it. A wave that is harder to ride is worth more. */
  worth: number;
}

/**
 * Three profiles that are three different rides, not one ride at three sizes.
 *
 * `peel` is the number that makes them differ in the hand rather than on paper: a mellow wave peels slower than
 * you can surf, so you can play with it; a barreling one peels faster than a comfortable line, so the ride is a
 * race you are losing on purpose.
 */
export const WAVE_PROFILES: readonly WaveProfile[] = [
  { id: 'runner', label: 'RUNNER', shape: 'mellow', height: 1.8, peel: 6.5, wall: 70, barrel: 0, worth: 1.0 },
  { id: 'wedge', label: 'WEDGE', shape: 'punchy', height: 2.6, peel: 8.5, wall: 46, barrel: 0.18, worth: 1.35 },
  { id: 'caverunner', label: 'CAVE', shape: 'barreling', height: 3.4, peel: 10.5, wall: 38, barrel: 0.42, worth: 1.8 },
];

export const profileById = (id: string): WaveProfile | null =>
  WAVE_PROFILES.find((p) => p.id === id) ?? null;

export interface WaveSection {
  kind: SectionKind;
  /** Range along the ride, metres from the takeoff. */
  from: number;
  to: number;
  /** What riding this section well is worth, before the wave's own multiplier. */
  pts: number;
}

/**
 * Where the sections of a wave are.
 *
 * Always at least takeoff, wall and close-out, with the barrel inserted mid-wall when the profile throws one —
 * which is where a real barrel is, because a wave stands up before it can pitch. The close-out is the last sixth:
 * a ride that ends in the close-out scores, a ride that is still going when it hits the sand does not.
 */
export function sectionsOf(p: WaveProfile): WaveSection[] {
  const out: WaveSection[] = [];
  const takeoff = Math.min(8, p.wall * 0.15);
  out.push({ kind: 'takeoff', from: 0, to: takeoff, pts: 60 });

  const closeFrom = p.wall * (5 / 6);
  if (p.barrel > 0) {
    const bLen = p.wall * p.barrel;
    const bFrom = takeoff + (closeFrom - takeoff - bLen) / 2;
    out.push({ kind: 'wall', from: takeoff, to: bFrom, pts: 90 });
    out.push({ kind: 'barrel', from: bFrom, to: bFrom + bLen, pts: 260 });
    out.push({ kind: 'wall', from: bFrom + bLen, to: closeFrom, pts: 90 });
  } else {
    out.push({ kind: 'wall', from: takeoff, to: closeFrom, pts: 90 });
  }
  out.push({ kind: 'closeout', from: closeFrom, to: p.wall, pts: 140 });
  return out;
}

/** Which section of the wave the rider is in, by distance along the ride. */
export function sectionAt(p: WaveProfile, along: number): WaveSection | null {
  return sectionsOf(p).find((s) => along >= s.from && along < s.to) ?? null;
}

// ── sets and the lineup ──────────────────────────────────────────────────────────────────────────────────────

/** Waves in a set, and the flat spell after it. */
export const SET_SIZE = 3;
export const WAVE_GAP_SEC = 9;
export const LULL_SEC = 14;
/** How many swells are in the water at once. */
export const SWELLS_VISIBLE = 3;
/** Metres between one swell line and the next, out to sea. */
export const SWELL_SPACING_M = 58;
/**
 * How fast a swell travels toward shore, m/s — the SAME for every profile, and that is the correction.
 *
 * A first version of this file advanced each swell at its own `peel` speed, which conflated two different
 * numbers: peel is how fast the break runs ALONG the beach, and it is what a rider races. Approach is how fast
 * the swell comes IN, and in real water that is set by depth, not by how hard the wave will eventually throw.
 * Using peel for both let a barreling swell overtake a mellow one sitting in front of it — waves passing through
 * each other, which a test caught by finding the break sequence out of order.
 */
export const APPROACH_MPS = 4.2;

export interface Swell {
  /** Which profile this one is. */
  profile: WaveProfile;
  /** Metres from the takeoff line; positive is still out to sea, 0 is breaking now. */
  out: number;
  /** Index in the endless sequence — so a set can be identified and a rhythm read. */
  n: number;
}

export interface LineupState {
  t: number;
  swells: Swell[];
  /** Index of the next swell to be created. */
  next: number;
}

/**
 * The profile for swell `n`.
 *
 * Deterministic, and deliberately NOT random: a lineup a player can read is one where watching the horizon tells
 * you something. The pattern builds within a set — the third wave of a set is the biggest — which is both true of
 * real sets and the reason to let two go by.
 */
export function profileFor(n: number): WaveProfile {
  const inSet = ((n % (SET_SIZE + 1)) + (SET_SIZE + 1)) % (SET_SIZE + 1);
  if (inSet === SET_SIZE) return WAVE_PROFILES[0];      // the straggler after the set, always the small one
  return WAVE_PROFILES[Math.min(WAVE_PROFILES.length - 1, inSet)];
}

/** True when swell `n` is the last of its set, so the lull follows it. */
export const isLastOfSet = (n: number): boolean =>
  ((n % (SET_SIZE + 1)) + (SET_SIZE + 1)) % (SET_SIZE + 1) === SET_SIZE;

/** Seconds between swell `n` breaking and swell `n+1`. */
export const gapAfter = (n: number): number => (isLastOfSet(n) ? LULL_SEC : WAVE_GAP_SEC);

export function startLineup(): LineupState {
  const swells: Swell[] = [];
  for (let i = 0; i < SWELLS_VISIBLE; i++) {
    swells.push({ profile: profileFor(i), out: i * SWELL_SPACING_M, n: i });
  }
  return { t: 0, swells, next: SWELLS_VISIBLE };
}

/**
 * Advance the lineup.
 *
 * Every swell moves shoreward at APPROACH_MPS, the same for all of them, so the order they were born in is the
 * order they break and nothing overtakes anything. The horizon is still information, but through SIZE rather than
 * speed: the third swell of a set standing taller than the two in front of it is the read. A swell that passes
 * the takeoff line is retired and a new one is seeded at the back, which keeps SWELLS_VISIBLE in the water
 * forever.
 */
export function stepLineup(state: LineupState, dt: number): { state: LineupState; broke: Swell[] } {
  const broke: Swell[] = [];
  let next = state.next;
  const swells: Swell[] = [];

  for (const sw of state.swells) {
    const out = sw.out - APPROACH_MPS * dt;            // every swell, the same: depth sets this, not the profile
    if (out <= 0) {
      broke.push({ ...sw, out: 0 });
      swells.push({ profile: profileFor(next), out: SWELL_SPACING_M * SWELLS_VISIBLE, n: next });
      next += 1;
      continue;
    }
    swells.push({ ...sw, out });
  }

  swells.sort((a, b) => a.out - b.out);
  return { state: { t: state.t + dt, swells, next }, broke };
}

/** The one a rider would paddle for: the nearest swell still out. */
export const nextRideable = (state: LineupState): Swell | null => state.swells[0] ?? null;

/** Total points available on a wave, for the HUD and for grading a ride. */
export function waveWorth(p: WaveProfile): number {
  return Math.round(sectionsOf(p).reduce((sum, s) => sum + s.pts, 0) * p.worth);
}

/**
 * WHO IS ON THE BEACH (BOARD-10PHASE P9).
 *
 * The beachgoers were nine `[x, z]` pairs inline in `buildSurfBreak`, at z 126 … 128.2. The sand is a 30 m ground
 * centred on z 138, so it runs 123 … 153 — but the water is deliberately drawn 4 m OVER the sand's near edge to
 * hide the waterline seam, which puts the actual waterline at z 127. Six of the nine stood at z ≤ 127.4: in the
 * wash, or under the water plane entirely, on a 26 m beach that was empty behind them.
 *
 * Nobody could have caught that from the numbers, because the beach's near edge was three local constants inside
 * an untestable builder and the crowd was a tenth. So the table is here and it is written in METRES INLAND FROM
 * THE WATERLINE: the one quantity that decides whether a person is standing on sand, and the one the builder can
 * supply without the table having to know where the shore was moved to.
 */
export interface Beachgoer {
  /** Metres across, 0 is straight down the line from the peak. */
  x: number;
  /** Metres inland from the waterline. Positive is up the beach, away from the water. */
  inland: number;
  watching: string;
}

/** Nobody stands closer than this to the water: below it they are in the wash or under the water plane. */
export const DRY_SAND_M = 2;
/** Nor further up than this, or they are off the back of the sand and standing on the backdrop. */
export const SAND_DEPTH_M = 26;

export const SURF_CROWD: Beachgoer[] = [
  // the knot at the peak — where a beach crowd actually stands, level with the takeoff
  { x: -13, inland: 4.5, watching: 'the peak' },
  { x: -10.5, inland: 6.2, watching: 'the peak' },
  { x: -8, inland: 4.8, watching: 'the peak' },
  // down the line, following the wall
  { x: 4, inland: 5.5, watching: 'the wall' },
  { x: 6.5, inland: 7.4, watching: 'the wall' },
  { x: 9, inland: 5.1, watching: 'the wall' },
  { x: 11.5, inland: 8.2, watching: 'the closeout' },
  // two sitting further up, out of the wash
  { x: 22, inland: 13.5, watching: 'nothing in particular' },
  { x: -24, inland: 12.8, watching: 'nothing in particular' },
];

/** Beachgoer positions given the world z of the waterline (the water's near edge, not the sand's). */
export function surfCrowd(waterEdgeZ: number): { x: number; z: number; watching: string }[] {
  return SURF_CROWD.map((c) => ({ x: c.x, z: waterEdgeZ + c.inland, watching: c.watching }));
}
