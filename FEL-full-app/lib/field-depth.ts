/**
 * lib/field-depth.ts — W4 match length targets for the seven field-sport modes.
 *
 * Each mode must reach at least `targetSec` in a scripted normal run (see
 * scripts/field-depth-tests.ts). Structure constants are the single source
 * wired into the live Babylon modes; arena-score-integrity MIRRORED pins them.
 */

export const FIELD_DEPTH_TARGET_SEC = {
  football: 45,
  bigAir: 40,
  baseball: 50,
  soccer: 45,
  tennis: 55,
  volleyball: 60,
  golf: 90,
} as const;

/** Live mode structure — keep in sync with mode files and MIRRORED. */
export const FIELD_DEPTH = {
  footballDrives: 5,
  bigAirAttempts: 5,
  derbyPitches: 30,
  derbyOutsCap: 15,
  breakawayClockSec: 11,
  golfHoles: 5,
  tennisGames: 6,
  volleyballPoints: 25,
} as const;
