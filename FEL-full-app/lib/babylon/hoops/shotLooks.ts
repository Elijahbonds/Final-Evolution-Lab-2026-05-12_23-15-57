// SHOT LOOKS (lane/hoops-shot-content, owner 2026-10-20) — which body a shot plays, decided in one place so the modes keep one-line
// hooks: the step-back's own gather and release (anim/authored/shotKit.ts), and the BANK's look — the angled set, the glance at the
// glass and the follow-through to the square when R1 "called glass" is held inside the bank band.
//
// Nothing here touches a timing window, a make chance or the ball's route: the step-back release is paced to the same green on its
// own release key; the bank's set is the shooter's FACING (presentation — no contest or make read reads the shooter's own yaw), the
// glance is the head's look target, and the arc still flies ShotArc's glass leg from wherever the hand lets go.
import type { Vector3 } from '@babylonjs/core';
import { followThroughFor, type ShotQuality } from '../core/BasketballCore';
import { bankPoint, inBankBand, type GatherKind } from '../core/HoopsMoves';
import { RELEASE_FRAME_01 } from '../core/BallHandling';
import { yawTo } from '../core/Biomech';
import { lateralOf } from '../anim/athleteSide';
import { releaseFrameOf } from '../anim/opponentMotion';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import { STEPBACK_RELEASE_CLIP, STEPBACK_RELEASE_01, BANK_FOLLOW_CLIP } from '../anim/authored/shotKit';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.bankSetDeg / hoops.bankGlanceMs (lib/feel-panel/knobs.ts)

type Anim = Pick<CharacterAnimator, 'clipNames'> & Partial<CharacterAnimator>;

/** The gather clip a gather kind plays (the step-back's own; the pull-up's for the rest — 1v1 already did this, 3v3 played the pull-up). */
export function gatherClipFor(kind: GatherKind | undefined): 'bball_stepback_gather' | 'bball_pullup_gather' {
  return kind === 'stepback' ? 'bball_stepback_gather' : 'bball_pullup_gather';
}

/** The rise a gather kind plays and the release fraction it is paced by (syncedShotSpeed): a step-back rises on its own release; every
 *  other rise is the jumpshot (the clip that really plays — a capture's release frame where one replaces it). A body without the kit
 *  (an unscoped spawn) keeps the jumpshot. */
export function riseClipFor(kind: GatherKind | undefined, animator: Anim): { clip: string; release01: number } {
  if (kind === 'stepback' && animator.clipNames?.has(STEPBACK_RELEASE_CLIP)) return { clip: STEPBACK_RELEASE_CLIP, release01: STEPBACK_RELEASE_01 };
  return { clip: 'jumpshot', release01: releaseFrameOf(animator as CharacterAnimator, 'jumpshot', RELEASE_FRAME_01) };
}

/** The angled set: how far the shooter turns off the rim toward the glass side while glass is called (deg; `(new)`, presentation;
 *  feel knob hoops.bankSetDeg). */
export const BANK_SET_DEG = 12;
/** How long the eyes stay on the square after the set / the release (ms) — the ball's flight to the glass and off it (feel knob
 *  hoops.bankGlanceMs). */
export const BANK_GLANCE_MS = 1100;

/**
 * The bank's LOOK for one shooter. The mode asks `setYaw` every shooting frame (the facing offset it adds to its face-the-rim yaw),
 * `followThrough` at the release (the clip to beat), and hands `target` to the head's look-at (the glance; null = the mode's own).
 */
export class BankLook {
  private aim: Vector3 | null = null;
  private until = -1;
  private now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  /** Radians to ADD to the face-the-rim yaw this frame: ±BANK_SET_DEG toward the glass while `glass` is held inside the band, else 0. */
  setYaw(shooter: Vector3, rim: Vector3, rimFloor: Vector3, boardNormal: Vector3, glass: boolean | undefined): number {
    if (!glass || !inBankBand(shooter, rimFloor, boardNormal)) return 0;
    const aim = bankPoint(shooter, rim, boardNormal);
    this.aim = aim; this.until = this.now() + feel('hoops.bankGlanceMs', BANK_GLANCE_MS);
    const toRim = yawTo(shooter, rim), toGlass = yawTo(shooter, aim);
    const d = Math.atan2(Math.sin(toGlass - toRim), Math.cos(toGlass - toRim));
    return Math.sign(d || 1) * feel('hoops.bankSetDeg', BANK_SET_DEG) * Math.PI / 180;
  }

  /** The follow-through for this release: a GREEN (perfect / good) release off the glass reads as a bank — the chest and the wrist to the
   *  square, the side being where the glass point is as the athlete is drawn. An early / late release keeps its own body (the miss reads
   *  before the rim, HOOPS-DEPTH S6). Not banked: followThroughFor, unchanged. */
  followThrough(quality: ShotQuality, banked: Vector3 | null, shooter: Vector3, yaw: number): string {
    if (!banked || (quality !== 'perfect' && quality !== 'good')) return followThroughFor(quality);
    this.aim = banked; this.until = this.now() + feel('hoops.bankGlanceMs', BANK_GLANCE_MS);
    return BANK_FOLLOW_CLIP[lateralOf(shooter, yaw, banked) >= 0 ? 'right' : 'left'];
  }

  /** Where the eyes go: the square while the set / the bank is on, else null (the mode's own target — the ball). */
  target(): Vector3 | null { return this.aim && this.now() < this.until ? this.aim : null; }

  /** A new possession: no glance carried over. */
  reset(): void { this.aim = null; this.until = -1; }
}
