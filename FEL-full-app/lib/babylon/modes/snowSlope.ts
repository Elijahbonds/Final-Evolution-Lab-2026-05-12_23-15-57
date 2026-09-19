// SNOW SLOPE — the freestyle furniture on the slalom piste, as DATA.
//
// Phase 1 of the board-sports pass measured snow at ONE grind line against skate's fourteen, and that one is a
// ski-lift cable with a `minApproachHeight`, so it is not street furniture at all: snow had nothing to grind and
// nothing to jump but the terrain itself. The SSX benchmark asks for at least eight features on the line.
//
// AS DATA, FOR THE SAME REASON AS skatePlaza: `buildSlopeRun` makes a DynamicTexture before it places anything,
// which needs a canvas, so nothing authored inside that builder can ever be reached by a headless test. A feature
// off the side of the piste, or one sitting on a slalom gate, would ship in silence.
//
// PLACED BY DISTANCE DOWN THE FALL LINE, not by world coordinates, because the piste is pitched: `onPiste(x, dist)`
// in the builder turns (lateral, distance) into a world point on the slope. Data that knew its own y would float or
// sink the moment the pitch or the run length changed.
//
// AND IT STAYS OFF THE GATES. The slalom's twelve gates are the mode's actual scoring line, at
// `SLALOM_START + i × SPACING` down the fall line and `slalomGateX(i)` across. A kicker on a gate is a gate the
// player cannot take. Everything here sits between gate distances AND out toward the piste edges, and the test
// checks both against the real gate formula.

export type SnowFeatureKind = 'kicker' | 'box' | 'rail' | 'roller' | 'wallride';

export interface SnowFeature {
  kind: SnowFeatureKind;
  /** Metres down the fall line from the start. */
  dist: number;
  /** Fraction of the piste half-width, + = rider's right. Kept off centre so the gate line stays clear. */
  lateral: number;
  /** Metres. */
  length: number;
  width: number;
  height: number;
  /** Grind bonus when the feature carries a rail; 0 when it does not. */
  bonus: number;
}

/** Nothing may sit closer than this to a slalom gate, metres along the fall line. */
export const GATE_CLEAR_M = 7;
/** Features live outside this fraction of the half-width, so the middle of the piste is always the racing line. */
export const EDGE_FRACTION = 0.42;

const F = (
  kind: SnowFeatureKind, dist: number, lateral: number,
  length: number, width: number, height: number, bonus = 0,
): SnowFeature => ({ kind, dist, lateral, length, width, height, bonus });

/**
 * The snow park, laid between the gates.
 *
 * Distances are chosen to sit midway between gates on a 20 m spacing (gates at 18, 38, 58 … 238), so a rider can
 * take a gate, hit a feature, and make the next gate. Bonuses are lower than skate's because a snow rail is caught
 * at speed on a slope and holds itself — the hard part is the landing, not the lock.
 */
export const SNOW_SLOPE: SnowFeature[] = [
  F('kicker', 28, -0.62, 7, 6, 1.9),
  F('rail', 48, 0.58, 16, 0.5, 0.9, 190),
  F('box', 68, -0.55, 12, 2.6, 0.8, 150),
  F('roller', 88, 0.5, 9, 9, 1.2),
  F('kicker', 108, -0.6, 8, 7, 2.4),
  F('rail', 128, 0.56, 20, 0.5, 1.1, 220),
  F('wallride', 148, -0.7, 14, 0.6, 3.0, 260),
  F('box', 168, 0.52, 14, 3.0, 0.9, 160),
  F('kicker', 188, -0.58, 9, 8, 2.8),
  F('rail', 208, 0.6, 18, 0.5, 1.0, 200),
  F('roller', 228, -0.5, 10, 10, 1.4),
  // THE LOWER MOUNTAIN (owner, 2026-09-19: "much bigger and longer"). The run now carries 30 gates to 598 m, so the
  // features carry on down it at the same rhythm — 10 m after each gate, alternating sides, which is what keeps a 9 m
  // roller and a 4 m gate off each other on the narrow venues. The bottom third runs bigger and faster: the kickers
  // grow, the rails run longer, and the last stretch is a wall-ride into a road gap before the finish.
  F('kicker', 248, 0.58, 10, 8, 3.0),
  F('rail', 268, -0.6, 22, 0.5, 1.1, 240),
  F('box', 288, 0.54, 16, 3.2, 1.0, 170),
  F('roller', 308, -0.52, 11, 11, 1.5),
  F('wallride', 328, 0.72, 16, 0.6, 3.4, 285),
  F('kicker', 348, -0.6, 11, 9, 3.2),
  F('rail', 368, 0.62, 24, 0.5, 1.2, 260),
  F('roller', 388, -0.54, 12, 11, 1.6),
  F('box', 408, 0.56, 18, 3.4, 1.0, 180),
  F('kicker', 428, -0.62, 12, 9, 3.4),
  F('rail', 448, 0.64, 26, 0.5, 1.2, 280),
  F('wallride', 468, -0.74, 18, 0.6, 3.6, 295),
  F('roller', 488, 0.56, 12, 12, 1.7),
  F('kicker', 508, -0.64, 13, 10, 3.6),
  F('rail', 528, 0.66, 28, 0.5, 1.3, 290),
  F('box', 548, -0.58, 20, 3.6, 1.1, 200),
  F('roller', 568, 0.58, 13, 12, 1.8),
  F('kicker', 588, -0.66, 14, 10, 3.8),
];

/** The gates, recomputed here so a test can check the features against the real thing. */
export const gateDist = (i: number, start: number, spacing: number): number => start + i * spacing;
export const gateX = (i: number, gates = 30): number =>
  i === 0 ? 0 : (i % 2 === 0 ? -1 : 1) * (3.1 + (gates > 1 ? i / (gates - 1) : 0) * 1.0);

/** Features that carry a grindable edge. */
export const snowRails = (): SnowFeature[] => SNOW_SLOPE.filter((f) => f.bonus > 0);

/**
 * WHERE PEOPLE WATCH FROM (BOARD-10PHASE P9).
 *
 * The spectators were authored inline in `buildSlopeRun` as eight `[side, dist]` pairs at `side * (HALF - 6)`
 * plus `side * Math.random() * 1.5`, and that had two faults the builder could never report:
 *
 *  1. IT PUT A BODY ON A KICKER. The eleven park features arrived in P3, after these spots were chosen. At
 *     night-park (bound 20) the kicker at dist 188 is 8 m wide about lateral −11.6, so it spans −15.6 … −7.6 —
 *     and the spot at dist 190 stood at −14, inside it. At alpine-run (bound 24) the same pair cleared by 8 cm.
 *  2. IT WAS UNMEASURABLE. `Math.random()` in the placement means no test can state where anyone stands, so the
 *     8 cm above was not a margin anybody had checked; it was luck, and the jitter could spend it either way.
 *
 * So the spots are a table, `side` is chosen per spot to be on the empty side of whatever feature shares its
 * stretch of the fall line, and the stagger that keeps a cluster from being a straight line is the spot's own
 * index rather than a random number. Lateral is metres inside the piste edge, not a fraction, because the
 * standoff that matters is from the edge (the trees sit at HALF − 2 and the lift pylons at HALF − 3.5), and that
 * distance does not scale with the venue.
 */
export interface SnowOnlooker {
  /** Metres down the fall line. */
  dist: number;
  /** Which side of the piste: −1 rider's left, +1 rider's right. */
  side: -1 | 1;
  /** What this group came to see, for a log line and for the test. */
  watching: string;
}

/** Metres in from the piste edge for the nearest row of spectators. Trees are at HALF − 2, pylons at HALF − 3.5. */
export const CROWD_INSET_M = 6;
/** No spectator may stand closer than this to any park feature's footprint. */
export const CROWD_FEATURE_CLEAR_M = 1;

export const SNOW_CROWD: SnowOnlooker[] = [
  { dist: 55, side: -1, watching: 'the first rail' },
  { dist: 58, side: -1, watching: 'the first rail' },
  { dist: 60, side: 1, watching: 'the first rail' },
  { dist: 120, side: 1, watching: 'the mid-course gates' },
  { dist: 125, side: -1, watching: 'the mid-course gates' },
  { dist: 125, side: 1, watching: 'the long rail' },
  // side +1 deliberately: the dist-188 kicker is on the left and 8 m wide, and this group used to stand on it.
  { dist: 190, side: 1, watching: 'the last kicker' },
  { dist: 193, side: 1, watching: 'the last kicker' },
];

/** Spectator positions as (lateral metres, distance down the fall line) for the builder's `onPiste`. */
export function snowCrowd(half: number): { lateral: number; dist: number; watching: string }[] {
  return SNOW_CROWD.map((c, i) => ({
    lateral: c.side * (half - CROWD_INSET_M + (i % 3) * 0.7),
    dist: c.dist,
    watching: c.watching,
  }));
}
