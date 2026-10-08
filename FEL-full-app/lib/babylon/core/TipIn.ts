// TIP-IN (HOOPS-10PHASE-2 phase 8) — rebound physics (LooseBall.ts) and box-outs (DefenderBrain's boxOut +
// resolvePickup's boxOutEdge) were already fully built in an earlier pass. What neither one had is the actual
// basketball move a tip-in IS: catching your own team's miss while it is still up near the rim and going straight
// back up in one motion, without ever dribbling it out. Before this, EVERY offensive board — however close,
// however high — fell through to the ordinary dribble/gather/shoot loop (confirmed: boardOutcome() only ever
// labelled the rebound 'putback' for the HUD banner; nothing read that label to skip the gather).
//
// Scoped narrow and additive on purpose, given how much live machinery (ShotArc, goaltending, momentum, net exit)
// already sits on the ordinary make path: this module only answers "is this secure close/high enough to try a
// tip, and does it go in" — it does not touch a single existing function. A missed tip changes nothing (the ball
// is already secured by the existing resolvePickup() call the same way any other board is; the mode just does not
// insta-score it) — the only new BEHAVIOUR this adds is an instant make on the rare, right-under-the-rim catch.
//
// Pure maths, no Babylon scene — same discipline as LooseBall.ts.

import { Vector3 } from '@babylonjs/core';

/** Horizontal distance from the rim's post inside which a catch is still "right there" for a tip, not a drive-out. */
export const TIP_IN_RANGE_M = 1.3;
/** A tip catches the ball NEAR the rim's height — on the way down off the iron, not after it has fallen to the
 *  floater zone. Below rim height minus this, it is a normal putback dribble-out, not a tip. */
export const TIP_IN_BELOW_RIM_M = 0.9;
/** Open look tip-in success — real tip-ins are a soft touch at an awkward angle, not a set shot; this is lower
 *  than an in-rhythm layup on purpose. TUNE(elijah): no live-rig feel pass was possible in this sandbox. */
export const TIP_IN_OPEN_PCT = 0.62;
/** A contested tip (someone else is right there boxing for the same ball) floors out here. */
export const TIP_IN_CONTESTED_FLOOR = 0.25;

/** Is this secured rebound close enough AND high enough to attempt a tip, rather than the ordinary dribble-out? */
export function isTipInEligible(ballPos: Vector3, rim: Vector3, putback: boolean): boolean {
  if (!putback) return false;   // a change-of-possession board is never a tip — you do not tip the OTHER team's miss
  const distXZ = Math.hypot(ballPos.x - rim.x, ballPos.z - rim.z);
  if (distXZ > TIP_IN_RANGE_M) return false;
  return ballPos.y >= rim.y - TIP_IN_BELOW_RIM_M;
}

/** Make chance for an eligible tip, narrowed by the same 0..1 contest reading every other shot in this suite
 *  uses (contestLevel in BasketballCore.ts) — so a tip is not a free two, it is a contestable shot like any other. */
export function tipInMakeChance(contest01: number): number {
  const c = Math.max(0, Math.min(1, contest01));
  return Math.max(TIP_IN_CONTESTED_FLOOR, TIP_IN_OPEN_PCT - c * (TIP_IN_OPEN_PCT - TIP_IN_CONTESTED_FLOOR));
}
