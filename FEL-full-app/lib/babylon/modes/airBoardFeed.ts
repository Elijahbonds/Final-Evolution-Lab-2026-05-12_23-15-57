// airBoardFeed — the big-air run read in the board family's animation grammar (boards pass phase 5, 2026-09-22).
//
// Big air was the one board mode with no BoardAnimTree: the run-up played the SPRINT loop (a runner's arms on a
// snowboard), the air played `jump_up` (a standing vertical jump held for two seconds of rotation — the family smoke
// measured 391 of 729 frames with both elbows locked past 160°, the T-arms), and the landing and the finish played the
// stand idle. The board clips it needed already exist (board_ride_idle / tuck / air / grab / land / land_sketchy /
// skate_bail) and the mode's clip scope already owns them. This maps the air-session core's four phases onto the tree's
// input; pure, so the mapping is testable without a scene.
import type { BoardAnimInput } from '../anim/boardTree';

export interface AirFeedSource {
  phase: 'Run' | 'Air' | 'Land' | 'Done';
  speed: number;
  maxRunSpeed: number;
  spinTurns: number;
  /** RB / SHIFT held on the run-in: the racer's tuck IS the throttle (SSX). */
  boostHeld: boolean;
  /** A grab was thrown this air (BoardTricks grab !== 'none'). */
  grabHeld: boolean;
  /** The landing beat the mode is holding (LAND_BEAT_SEC after the touchdown), or none. */
  landBeat: 'none' | 'clean' | 'sketchy';
  /** The crash beat the mode is holding. */
  bailing: boolean;
  /** The run is over and the last landing was not a crash: the rider stomps it. */
  finished: boolean;
}

export const AIR_LAND_BEAT_SEC = 0.45;
export const AIR_BAIL_BEAT_SEC = 1.2;

export function airBoardFeed(s: AirFeedSource): BoardAnimInput {
  const airborne = s.phase === 'Air';
  const speed01 = s.phase === 'Run' ? Math.min(1, Math.max(0, s.speed / Math.max(0.1, s.maxRunSpeed)))
    : s.phase === 'Air' || s.phase === 'Land' ? 1     // the rider still carries the run's speed onto the landing
    : 0;                                              // Done: stopped
  return {
    speed01,
    pushing: false,
    lean: 0,
    airborne,
    grabHeld: airborne && s.grabHeld,
    flipping: false,
    spinning: airborne && Math.abs(s.spinTurns) > 0.05,
    grinding: false,
    manual: false,
    landing: s.landBeat,
    bailing: s.bailing,
    // the run-in tuck: the throttle on the body — only when there is speed worth tucking over
    tucking: s.phase === 'Run' && s.boostHeld && speed01 > 0.2,
    celebrating: s.phase === 'Done' && s.finished && !s.bailing,
  };
}
