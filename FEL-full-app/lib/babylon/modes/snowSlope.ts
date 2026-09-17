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
];

/** The gates, recomputed here so a test can check the features against the real thing. */
export const gateDist = (i: number, start: number, spacing: number): number => start + i * spacing;
export const gateX = (i: number): number => (i === 0 ? 0 : (i % 2 === 0 ? -1 : 1) * (3.1 + (i / 11) * 1.0));

/** Features that carry a grindable edge. */
export const snowRails = (): SnowFeature[] => SNOW_SLOPE.filter((f) => f.bonus > 0);
