// TIEBREAK — the portrait framing (lane/tiebreak-cam, 2026-10-20). Pure, so a test can hold it; TiebreakMode.ts feeds it the
// player's x and the screen's aspect and applies the answer to the load's camera.
//
// WHY. Tiebreak's play camera never moves: load() snaps it once (CameraDirector.snapTo, the shared 'court' preset) with the
// player in the middle of his baseline, and nothing steps the director after that. The player then slides to his spot,
// SPOT_X = 1.7 m to the side the ball is coming, and the ball arrives in its lane LANE_X = 2.5 m out. The lens is the
// harness's vertical-fixed 0.8 rad, and the venue's bounds hold the camera 5.8 m behind the baseline (z 15.8, not the
// preset's 12.5 m). On a desktop or a sideways phone that frame is ±5.3 m wide at the player — both spots, both lanes. On a
// phone held upright (390×844, aspect 0.46) the same lens is only 2·atan(tan 0.4 × 0.46) = 22° across: ±1.13 m at the
// player and ±1.37 m at the racket. Neither spot and neither lane is in it. Measured on the ship-ready rig: the player's
// chest projects to x −0.23 or 1.23 of the frame width from the first frame of play, so FrameGuard's second sample always
// lands on a miss and it recenters (SHIP-READINESS §4).
//
// THE FIX. Upright only (aspect < 1), the camera TRUCKS: it slides sideways with the player and looks straight down the court,
// its height, distance, pitch and lens untouched, so the shot is the shipped one moved over. It sits halfway between his spot
// and his lane, so both read: the player a little to one side of centre, the ball's lane a little to the other, the rival on
// the far side. It is pinned to the player's x, which his slide already eases (6/s): no second lag to fall behind him on a
// side switch, and his shuffle still reads, because he crosses the centre of the frame as the court slides under him. A wider
// screen (aspect >= 1: every desktop and a sideways phone) holds both already and is never touched: the camera stays exactly
// where load() put it. A rotate is a cut (the load's camera back, or the trucked one), as a resize is for the lens elsewhere.

import { incomingX } from '../core/TiebreakFlight';

/** Where a body stands to meet the ball: this far to the side the ball comes (m). TiebreakMode's slide() reads it. */
export const SPOT_X = 1.7;
/** The ball's lane at your racket (m): TiebreakFlight's incoming x at the end of its flight. */
export const LANE_X = Math.abs(incomingX('right', 1));

/**
 * TUNED (new), portrait only: the camera's x is this × the player's x. 1.24 puts the line of sight halfway between his spot
 * (1.7 m) and his lane (2.5 m) when he stands at it.
 */
export const PORTRAIT_TRUCK_GAIN = (SPOT_X + LANE_X) / 2 / SPOT_X;

/** Is this screen too narrow for the load's frame to hold the player's spots and lanes? Upright: wider than tall is not. */
export function isPortrait(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0 && aspect < 1;
}

/** Upright: the x (m) the camera and its aim sit at, for the player at `playerX`. The rest of the pose is the load's. */
export function portraitCamX(playerX: number): number {
  return playerX * PORTRAIT_TRUCK_GAIN;
}
