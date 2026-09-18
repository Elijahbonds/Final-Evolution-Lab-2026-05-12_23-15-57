// Shared timings. ballRig keys the ball path to the SAME eastbay timestamps as
// the clip, so hands and ball can never drift apart.

export const EASTBAY_TIMING = {
  gather: 0.0,
  rise: 0.3,
  underKnee: 0.55,   // ball hand reaches under the raised left knee
  handOff: 0.75,     // hand-to-hand pass beneath the leg
  carryUp: 1.0,      // receiving hand carries the ball up
  extend: 1.25,      // one-hand extension to the rim
  hang: 1.5,
  duration: 1.5,
} as const;

export const DUNK_TIMING = {
  chargeSec: 0.5,
  launchSec: 0.35,
  hangSec: 0.8,
  landSec: 0.45,
} as const;
