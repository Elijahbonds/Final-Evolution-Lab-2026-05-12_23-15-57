// TRICK POSE — what a named board trick LOOKS like, frame by frame (2026-09-15, owner: "The animations need to be
// recognizable on sight" — board tricks first).
//
// The vocabulary (BoardTricks.ts) named 34 tricks and scored them properly, but the picture never followed the name:
//   · SKATE: the deck never flipped. BoardSync only ever set the deck's pitch and a lean, so a KICKFLIP integrated a
//     number for the landing grade while the board sat flat under the feet. A SHUV-IT turned the whole rider. Every grab
//     (indy, melon, japan, method, stalefish) played the one board_grab clip, so they were the same picture.
//   · SNOW / SURF: TrickMachine added the spin to the rider's yaw, and the mode overwrote the yaw from the momentum model
//     on the very next frame — a 720 was a one-frame twitch. A CORK or a RODEO differed from a flat spin only in points.
//
// A trick is recognised by its SHAPE, so this is the shape as data, from the table itself:
//   · SPIN (spinDeg)  — the rider turns about their own up axis, and the turn is CAUGHT at the trick's angle (a 540 ends
//                       at 540, not wherever the air ran out)
//   · OFF-AXIS (a snow flipDeg: cork / rodeo) — the spin axis tips over and comes back: inverted at the top of a rodeo
//   · BOARD FLIP (a skate flipDeg) — the deck rolls about its long axis under the lifted feet; kick one way, heel the other
//   · SHUV (a skate board-only spin: shuv-it, 360 flip) — the deck turns flat under a rider who does NOT turn
//   · GRAB (grab shape) — WHICH hand takes WHICH edge WHERE, and how the deck is tweaked: an indy is the back hand on the
//                       toes between the feet; a method is the front hand on the heels with the deck pulled up behind.
//
// Pure: numbers only. Modes feed the elapsed air time; BoardTrickLayer applies the result to the rig.

import type { BoardTrick, GrabShape } from './BoardTricks';

export type GrabHand = 'front' | 'back';
export type GrabEdge = 'toe' | 'heel' | 'nose' | 'tail';

export interface GrabSpec {
  hand: GrabHand;
  edge: GrabEdge;
  /** Along the deck, −1 tail … +1 nose. */
  along: number;
  /** Deck tweak while held, radians: roll about the long axis (+ = toe edge up), pitch (+ = nose up). */
  tweakRoll: number;
  tweakPitch: number;
  /** How high the deck comes up toward the hand, metres (the knees tuck with it). */
  lift: number;
}

const D = Math.PI / 180;

/** The grabs, as a skater would describe them. Regular or goofy is resolved from the rig by the layer. */
export const GRAB_SPECS: Record<Exclude<GrabShape, 'none'>, GrabSpec> = {
  indy:      { hand: 'back',  edge: 'toe',  along: 0,     tweakRoll: 10 * D,  tweakPitch: 0,       lift: 0.28 },
  melon:     { hand: 'front', edge: 'heel', along: 0,     tweakRoll: -10 * D, tweakPitch: 0,       lift: 0.28 },
  method:    { hand: 'front', edge: 'heel', along: -0.1,  tweakRoll: -55 * D, tweakPitch: 18 * D,  lift: 0.45 },
  stalefish: { hand: 'back',  edge: 'heel', along: -0.25, tweakRoll: -20 * D, tweakPitch: -8 * D,  lift: 0.3 },
  japan:     { hand: 'front', edge: 'toe',  along: 0.45,  tweakRoll: 62 * D,  tweakPitch: 50 * D,  lift: 0.5 },   // the deck hauled up behind, nose high: the most tweaked grab on the list
  nose:      { hand: 'front', edge: 'nose', along: 1,     tweakRoll: 0,       tweakPitch: 22 * D,  lift: 0.22 },
  tail:      { hand: 'back',  edge: 'tail', along: -1,    tweakRoll: 0,       tweakPitch: -22 * D, lift: 0.22 },
};

/** Tricks whose spinDeg belongs to the DECK, not the rider. */
export const BOARD_ONLY_SPINS: ReadonlySet<string> = new Set(['shuvit', 'tre']);

export interface TrickPoseOut {
  /** Rider yaw ADDED to the heading, radians. */
  bodyYaw: number;
  /** Rider off-axis tilt, radians about the rider's side axis (a rodeo goes over this way). */
  bodyTilt: number;
  /** Deck roll about its long axis (a flip), radians. */
  boardRoll: number;
  /** Deck yaw under the feet (a shuv), radians. */
  boardYaw: number;
  /** Deck pitch, radians. */
  boardPitch: number;
  /** Deck lift toward the hands, metres. */
  boardLift: number;
  /** 0..1: how tucked the knees are. */
  tuck01: number;
  /** The grab being held, weighted in and out. */
  grab: (GrabSpec & { weight: number }) | null;
  /** 0..1 through the trick's own motion. */
  progress: number;
  /** The motion has finished (a grab may still be held). */
  done: boolean;
}

export const NO_TRICK_POSE: TrickPoseOut = { bodyYaw: 0, bodyTilt: 0, boardRoll: 0, boardYaw: 0, boardPitch: 0, boardLift: 0, tuck01: 0, grab: null, progress: 0, done: true };

/** How long the trick's motion takes, seconds — inside its own air budget, so a legal trick always completes. */
export function trickSeconds(t: BoardTrick): number {
  const spin = Math.abs(t.spinDeg), flip = Math.abs(t.flipDeg);
  if (t.discipline === 'skate') {
    if (flip && BOARD_ONLY_SPINS.has(t.id)) return 0.5;          // the 360 flip: the deck does both at once
    if (flip) return 0.38;                                        // a flip is quick: flicked, turns, caught
    if (BOARD_ONLY_SPINS.has(t.id)) return 0.32;                   // shuv-it
  }
  const needs = Math.max(spin / 360 * 0.62, flip / 180 * 0.5, t.grab !== 'none' ? 0.18 : 0);
  return Math.max(0.25, Math.min(t.airSec > 0 ? t.airSec * 0.85 : 1, needs || 0.25));
}

const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * The pose `elapsed` seconds into `trick`. `held` = the grab button is still down (a grab holds past its motion); the
 * grab weights in over GRAB_IN and out over GRAB_OUT after release.
 */
export const GRAB_IN = 0.12;
export const GRAB_OUT = 0.1;
export function trickPose(t: BoardTrick, elapsed: number, held = true, releasedFor = 0): TrickPoseOut {
  const dur = trickSeconds(t);
  const p = clamp01(elapsed / dur);
  const e = easeInOut(p);
  const out: TrickPoseOut = { ...NO_TRICK_POSE, progress: p, done: p >= 1 };
  const spin = t.spinDeg * D, flip = t.flipDeg * D;
  const boardSpin = t.discipline === 'skate' && BOARD_ONLY_SPINS.has(t.id);

  if (t.kind === 'air') {
    if (spin) { if (boardSpin) out.boardYaw = spin * e; else out.bodyYaw = spin * e; }
    if (flip) {
      if (t.discipline === 'skate') {
        out.boardRoll = flip * e;
        out.boardLift = -0.1 * Math.sin(Math.PI * p);            // the deck drops away under the lifted feet as it turns
        out.tuck01 = Math.sin(Math.PI * p);
      } else {
        out.bodyTilt = flip * Math.sin(Math.PI * p);            // cork / rodeo: over at the top, back upright to land
      }
    }
    if (spin && !flip && !boardSpin) out.tuck01 = 0.35 * Math.sin(Math.PI * p);
  }

  if (t.grab !== 'none') {
    const spec = GRAB_SPECS[t.grab];
    const on = held ? clamp01(elapsed / GRAB_IN) : clamp01(1 - releasedFor / GRAB_OUT);
    // a grab thrown with a flip waits for the deck to come round; with a spin it rides along
    const gate = flip && t.discipline === 'skate' ? clamp01((p - 0.85) / 0.15) : 1;
    const w = on * gate;
    if (w > 0) {
      out.grab = { ...spec, weight: w };
      out.boardRoll += spec.tweakRoll * w;
      out.boardPitch += spec.tweakPitch * w;
      out.boardLift += spec.lift * w;
      out.tuck01 = Math.max(out.tuck01, w);
    }
  }
  return out;
}
