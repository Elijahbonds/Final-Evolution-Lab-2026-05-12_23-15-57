// courtDims — THE ONE PLACE A HOOP'S DIMENSIONS LIVE (HOOP-UNIFY-2026-10-23, step 1: a pure move).
//
// The game had three hoop definitions that disagree (the dunk's NexusWebScene prop, the VenueKit venue hoop, the shot physics'
// RIM_RADIUS), with the rim height typed as a literal in a dozen places. Step 1 moves every value here WITH TODAY'S VALUE PER
// CALLER — nothing changes behaviour, the dunk's contact windows and Check C (scripts/onevone-depth-tests.ts) stay word for word.
// Changing a value is a later, separate step behind tests (HOOP-UNIFY "Migration risk"; HU-5/HU-6).
//
// No imports on purpose: every hoop builder, rim test and the dragon ride read this without a cycle.

/** Regulation 10 ft = 3.048 m; 3.05 is the rounded value the game has always used. */
export const RIM_HEIGHT_M = 3.05;
/** Regulation 18 in inner diameter = 0.4572 m → r 0.2286 (moved from core/RimPhysics.ts:18, which re-exports it). The shot /
 *  rim physics and the 1v1 / 3v3 rim paths use this. */
export const RIM_RADIUS = 0.2286;
/** NOT regulation. The dunk's ring is ~2× regulation as a readability choice (PM call 2026-10-23 4:48 PM PT, Elijah can overrule;
 *  HOOP-UNIFY "Decision"). Only the Dunk-mode / dunk-hoop paths read it (HU-7). OPEN for Elijah: shrink to RIM_RADIUS? */
export const DUNK_RIM_RADIUS = 0.45;

/** The dunk hoop: the NexusWebScene `hoop` prop (the one Dunk mode plays on), values as built at ce122bb7. Metres, prop-local,
 *  before the prop's scale. */
export const HOOP = Object.freeze({
  RIM_HEIGHT_M,
  RIM_RADIUS,
  DUNK_RIM_RADIUS,
  /** The rim ring's forward offset from the prop origin / pole centre (HOOP_RIM_OFFSET.z). */
  POLE_BEHIND_RIM_M: 0.72,
  /** The visual torus thickness (diameter of the tube). */
  RIM_TUBE_M: 0.055,
  BOARD_W: 1.8,
  BOARD_H: 1.05,
  BOARD_D: 0.06,
  /** The board's centre above the rim height (the builder's `HOOP_RIM_OFFSET.y + 0.45`). */
  BOARD_CENTRE_ABOVE_RIM_M: 0.45,
  /** The board's centre forward of the prop origin (z). */
  BOARD_CENTRE_Z_M: 0.3,
  /** Board bottom below the rim height (centre +0.45 − half of 1.05) and top above it — DunkMode's glass fallback. */
  BOARD_BOTTOM_BELOW_RIM_M: 0.075,
  BOARD_TOP_ABOVE_RIM_M: 0.975,
  /** The board's front face to the rim centre (board z 0.3 + half depth 0.03; rim z 0.72). */
  BOARD_FACE_TO_RIM_CENTRE_M: 0.39,
  POLE_H_M: 3.30,
  POLE_D_M: 0.16,
  NET_TOP_D: 0.82,
  NET_BOTTOM_D: 0.44,
  NET_H: 0.42,
  /** The net's centre below the rim height (half the net's height). */
  NET_CENTRE_BELOW_RIM_M: 0.21,
});

/** The VenueKit venue hoop (visual/VenueKit.ts), values as built at ce122bb7. Venue-local metres. Its ring is r 0.23 (Ø 0.46). */
export const VENUE_HOOP = Object.freeze({
  RIM_RADIUS: 0.23,
  RIM_TUBE_M: 0.03,
  RIM_Z: -0.6,
  BOARD_W: 1.8,
  BOARD_H: 1.05,
  BOARD_D: 0.06,
  BOARD_Y: 3.45,
  BOARD_Z: -1.15,
  POLE_H_M: 3.9,
  POLE_D_M: 0.16,
  POLE_Y: 1.95,
  POLE_Z: -1.6,
  NET_TOP_D: 0.44,
  NET_BOTTOM_D: 0.3,
  NET_H: 0.42,
  NET_Y: 2.83,
});
