// DerbyLoop — the Home Run Derby's pure reads (IMPROVE 2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Derby). DerbyMode
// (modes/precisionModes.ts) wires them; nothing here touches Babylon, so the headless tests read the mode's own numbers.
//
//   #2  the rival's line ticks by OUTS as well as pitches, and the round ends WIN / LOSS against it;
//   #3  a mistimed swing says how early or late it was;
//   #4  a homer's feet come from the flight (the wall crossing and the rest of its arc), not a made-up 300 + q × …;
//   #5  the pitch sequence is seeded per session (same mix, same zone envelope, same speeds);
//   #6  the stick at the swing nudges the bearing (no random scatter);
//   #8  the contact cue: an approach ring that closes as the ball comes into the ±0.15 s window;
//   #12 the bat-flip opens in the set between pitches as well as the wind-up.
import { seeded01 } from './GolfLoop';
import { feetFromMetres } from './derbyHud';

// ── #5 the pitch sequence ────────────────────────────────────────────────────────────────────────────────────────────
export type DerbyPitchType = 'fastball' | 'slider' | 'changeup';
/** The pitch mix: fastballs to learn on, then a real mix (moved here from precisionModes so the seeded read shares it). */
export const PITCH_MIX: readonly DerbyPitchType[] = ['fastball', 'fastball', 'slider', 'fastball', 'changeup', 'slider', 'fastball', 'changeup', 'slider', 'fastball'];
/** The first pitches of every derby are fastballs: you learn the timing before the mix starts. */
export const LEARN_FASTBALLS = 2;

/** The derby's session seed (a new sequence each play; one value, so a probe can pin it and re-read the pitches). */
export function derbySeed(nowMs: number = Date.now()): number {
  return Math.floor(nowMs) % 1000003;
}

/** What pitch `round` is and where it goes, as unit reads: the type, the zone's x and y (−1..1, the old sin / cos
 *  envelope) and which way a slider breaks. `seed` undefined is the old fixed sequence, bit for bit (the depth suite
 *  and any driver that calls pitchSpec(round) still read it); a seed rotates the mix after the learning fastballs and
 *  phase-shifts the location walk and the slider's side, so the envelope and the proportions are the same derby. */
export function pitchShape(round: number, seed?: number): { type: DerbyPitchType; ux: number; uy: number; breakSign: 1 | -1 } {
  if (seed === undefined) {
    return {
      type: PITCH_MIX[(round - 1) % PITCH_MIX.length],
      ux: Math.sin(round * 2.7), uy: Math.cos(round * 1.9),
      breakSign: round % 2 === 0 ? 1 : -1,
    };
  }
  const rot = Math.floor(seeded01(seed, 1) * PITCH_MIX.length);
  const type = round <= LEARN_FASTBALLS ? 'fastball' : PITCH_MIX[(round - 1 + rot) % PITCH_MIX.length];
  const px = seeded01(seed, 2) * Math.PI * 2, py = seeded01(seed, 3) * Math.PI * 2;
  const flip = seeded01(seed, 4) < 0.5 ? 0 : 1;
  return { type, ux: Math.sin(round * 2.7 + px), uy: Math.cos(round * 1.9 + py), breakSign: (round + flip) % 2 === 0 ? 1 : -1 };
}

// ── #2 the rival ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** How far through the round we are: pitches OR outs, whichever is further (most rounds end on outs, not pitches). */
export function derbyProgress(round: number, outs: number, total: number, outsCap: number): number {
  return Math.max(0, Math.min(1, Math.max(round / Math.max(1, total), outs / Math.max(1, outsCap))));
}
/** The verdict against the rival's round: you have to BEAT the number (a tie is the rival's). */
export function rivalVerdict(homers: number, rivalHomers: number): 'WIN' | 'LOSS' {
  return homers > rivalHomers ? 'WIN' : 'LOSS';
}
export function rivalLine(homers: number, rivalHomers: number): string {
  return rivalVerdict(homers, rivalHomers) === 'WIN'
    ? `YOU WIN THE DERBY — ${homers} HR to ${rivalHomers}`
    : homers === rivalHomers ? `TIED AT ${homers} — THE RIVAL KEEPS THE CROWN` : `RIVAL WINS — ${rivalHomers} HR to ${homers}`;
}

// ── #3 / #8 the timing window ────────────────────────────────────────────────────────────────────────────────────────
/** Seconds until the ball reaches the contact point (negative once it is past). */
export function secToContact(ballZ: number, contactZ: number, speed: number): number {
  return (ballZ - contactZ) / Math.max(speed, 0.1);
}
/** A swing outside the window: which side, and by how many milliseconds past the window's edge. */
export function timingMiss(ballZ: number, contactZ: number, speed: number, halfSec: number): { early: boolean; ms: number } {
  const s = secToContact(ballZ, contactZ, speed);
  return { early: s > 0, ms: Math.max(0, Math.round((Math.abs(s) - halfSec) * 1000)) };
}
/** The banner for it. `released` false: the swing came before the ball left the hand. */
export function timingMissLine(m: { early: boolean; ms: number }, released = true): string {
  if (!released) return 'WAY EARLY — the ball is still in his hand';
  return `${m.early ? 'EARLY' : 'LATE'} by ${m.ms} ms`;
}
/** The approach ring: `fill` 0 → 1 over the `leadSec` before the window opens, `inWindow` while a swing would connect,
 *  `show` from the lead until the window has closed. */
export function contactCue(ballZ: number, contactZ: number, speed: number, halfSec: number, leadSec: number): { show: boolean; fill: number; inWindow: boolean } {
  const s = secToContact(ballZ, contactZ, speed);
  const inWindow = Math.abs(s) <= halfSec;
  const toOpen = s - halfSec;
  const fill = inWindow || toOpen <= 0 ? 1 : Math.max(0, 1 - toOpen / Math.max(1e-3, leadSec));
  return { show: s >= -halfSec && toOpen <= leadSec, fill, inWindow };
}

// ── #4 the distance ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Where the ball comes down (metres from the plate): the flight from here — a plain ballistic arc under `g`, the same
 *  integration Flight runs — projected to the ground. */
export function landingRangeM(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, g: number): number {
  const a = 0.5 * g, b = vel.y, c = Math.max(0, pos.y);
  const t = (b + Math.sqrt(b * b + 4 * a * c)) / (2 * a);   // the positive root of c + b·t − a·t² = 0
  return Math.hypot(pos.x + vel.x * t, pos.z + vel.z * t);
}
/** A homer's distance in feet, from the flight at the wall. */
export function homerFeet(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, g: number): number {
  return feetFromMetres(landingRangeM(pos, vel, g));
}

// ── #6 the stick aims ────────────────────────────────────────────────────────────────────────────────────────────────
/** Sideways exit speed (m/s) the stick adds at the swing, full deflection: about ±5° on a 34 m/s drive. */
export const STICK_AIM_MPS = 3;
/** The swing's sideways exit speed: timing pulls or pushes (`side` −1..1 × 17 m/s), the stick nudges. No dice. */
export function hitLateral(side: number, stickX: number): number {
  return side * 17 + Math.max(-1, Math.min(1, stickX)) * STICK_AIM_MPS;
}

// ── #12 the bat-flip ─────────────────────────────────────────────────────────────────────────────────────────────────
/** B is the bat-flip vault in the SET (between pitches) or the wind-up; once a pitch. */
export function batFlipRead(s: { incoming: boolean; throwIn: number; pending: boolean; trickDone: boolean; ended: boolean }): 'ok' | 'spent' | 'closed' {
  if (s.ended) return 'closed';
  const open = s.pending || (s.incoming && s.throwIn > 0);
  if (!open) return 'closed';
  return s.trickDone ? 'spent' : 'ok';
}
