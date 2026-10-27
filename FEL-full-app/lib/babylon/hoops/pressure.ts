// ON-BALL PRESSURE (1v1 / 3v3 ten-phase pass, phase 2 "defence is skill, not dice": "the AI defends my drives for real").
//
// Before: DefenderBrain's on-ball man on a MOVING handler stood at 35–60 % of the way from the handler to the rim (the contain lever,
// deeper the faster the drive) — 2.1–3.6 m off a handler 6 m out. From there no poke reaches the ball (core/ReachTell POKE_RANGE 1.2 m
// to the led ball), no hand reaches a shot, and the release reads OPEN; the hoops-round2 rig counted 0 AI stops in 14 of my
// possessions. (Against a STANDING handler the deny point already finishes at arm's length, DefenderBrain.ARMS_LENGTH 1.25 m.)
// After: the cushion on a moving handler is capped at ONBALL_CUSHION_M — still between him and the rim, still dropping with the drive
// as far as the cap allows, so a crossover he reads late (hoops/reaction: 420 / 220 / 120 ms by tier) still beats him; but a handler
// who dribbles straight at him is in reach of his hands.
// Knob `hoops.onBallCushionM` (0 = today's lever, uncapped). Pure.
import { feel } from '../../feel-panel/feel';

/** The most room the on-ball man gives a moving handler (m, planar, handler to deny point). Knob `hoops.onBallCushionM`. */
export const ONBALL_CUSHION_M = 1.35;

/** The contain lever (share of handler → rim) capped so the cushion is at most ONBALL_CUSHION_M. `toHoopM` = handler to rim (m). */
export function cushionLever(lever: number, toHoopM: number): number {
  const cap = feel('hoops.onBallCushionM', ONBALL_CUSHION_M);
  if (!(cap > 0) || !(toHoopM > 1e-3)) return lever;
  return Math.min(lever, cap / toHoopM);
}
