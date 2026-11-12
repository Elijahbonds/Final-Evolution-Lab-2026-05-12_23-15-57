// releaseTiming — the ball leaves the hand ON the clip's release (1v1 / 3v3 ten-phase pass, phase 4 "feet and transitions"; routed from
// phase 2: "the 3v3 rival's shot leaves the hand before the clip's arms are up, with the ball at chest or waist height").
//
// A rival's shot is decided by the game clock: the tell (3v3 GATHER_TELL_SEC 0.35 s, 1v1 GATHER_SEC 0.32 s) ends and the ball is released.
// The clip that plays through the tell was started at its first frame at speed 1: the captured jumper (bball_mc_jumpshot, 0.9 s) dips
// first and reaches its release key at 0.75 of the clip — 0.68 s in — so the ball left the hand at the dip, at the chest. The clip is
// now PACED to the tell: entered at its rise (the load is skipped — the tell's gather is the load, as the 3PT shooter's held set is),
// at the speed that puts its release key on the tell's last frame. The game clock is unchanged (no timing change); only the clip moves.
// A finish (a layup, a floater, a fade, a hook) is paced the same way on its release key (core/HoopsMoves FINISH_RELEASE_KEY_SEC).
import { feel } from '../../feel-panel/feel';
import { releaseFrameOf, riseStartOf } from '../anim/opponentMotion';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import { RELEASE_FRAME_01 } from '../core/BallHandling';
import { FINISH_RELEASE_KEY_SEC, type FinishStyle } from '../core/HoopsMoves';

/** 1 = the shot clip is paced to the release; 0 = the release's clip from its first frame at speed 1 (the A/B). Knob
 *  `hoops.releaseToClipOn`. */
export const RELEASE_TO_CLIP_ON = true;
/** The pace is kept inside this (× the clip's own speed): a tell far shorter or longer than the clip plays it at the bound. */
export const PACE_MIN = 0.6, PACE_MAX = 2.6;

/** 1 = the hero's jumper is entered at its rise (CAPTURE_RISE_START_01) and paced from there to the green; 0 = from its first frame (the
 *  load dip the ball rode for ~14 frames after the press: phase 1's routed finding). Knob `hoops.jumperFromRiseOn`. */
export const JUMPER_FROM_RISE_ON = true;
export const jumperFromRiseOn = (): boolean => feel('hoops.jumperFromRiseOn', JUMPER_FROM_RISE_ON ? 1 : 0) >= 0.5;
export const releaseToClipOn = (): boolean => feel('hoops.releaseToClipOn', RELEASE_TO_CLIP_ON ? 1 : 0) >= 0.5;

export interface ClipPace { from01: number; speedRatio: number }
const clamp = (x: number): number => Math.min(PACE_MAX, Math.max(PACE_MIN, x));

/** The jumper's pace for a release `toSec` from now: entered at its rise, its release key on `toSec`. Null with the knob off. */
export function jumperPace(animator: Pick<CharacterAnimator, 'clipNames' | 'durationOf'>, toSec: number, clip = 'jumpshot'): ClipPace | null {
  if (!releaseToClipOn()) return null;
  const a = animator as CharacterAnimator;
  const release01 = releaseFrameOf(a, clip, RELEASE_FRAME_01);
  const rise01 = Math.min(riseStartOf(a, clip, 0), release01);
  const dur = animator.durationOf(clip) ?? 0.9;
  return { from01: rise01, speedRatio: clamp(((release01 - rise01) * dur) / Math.max(0.05, toSec)) };
}

/** A finish clip's pace for a release `toSec` from now: its release key (FINISH_RELEASE_KEY_SEC, at speed 1) on `toSec`. */
export function finishPace(style: FinishStyle, toSec: number): ClipPace | null {
  if (!releaseToClipOn()) return null;
  return { from01: 0, speedRatio: clamp(FINISH_RELEASE_KEY_SEC[style] / Math.max(0.05, toSec)) };
}
