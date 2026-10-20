// H2e (owner 2026-10-16, "more dunks": the H4 row's ground pulled forward). Four ways a game dunk got bigger, all on clips the hoops rigs
// already carry (ClipScope gives both hoops modes the 'dunk' suite):
//
//   THE FAMILY BY THE STICK — at the takeoff (the first FAMILY_PICK_K of the flight) the right stick names the dunk: up the ONE-HAND FLUSH
//     (new), down the two-hand flush, right the windmill, left the cradle. No timing, no gamble: that is the in-air trick stick's job, and
//     its window (DunkTrickStick CLEAN_WINDOW, from k 0.30) opens after this one closes. No stick: the drive picks (pickHoopsDunk).
//   THE PUTBACK DUNK — an offensive board caught at the iron (the tip-in's own geometry) goes straight back up as a slam: mine when I hold
//     R2 (the turbo is the dunk's own button), the rival's PUTBACK_AI_DUNK of the time.
//   THE ALLEY-OOP, RECEIVED (3v3) — calling for the ball while cutting hard at the rim brings a LOB, and the catch is the dunk.
//   THE CONTEST'S TRICKS IN GAMES — on a breakaway with the game going my way, the trick stick's four tricks are the dunk contest's bigger
//     four (a 360 windmill, the scorpion, the behind-the-back, the 720): more for a green, more lost on a miss.
import type { HoopsDunk } from './HoopsDunks';
import { STANDING, WINDMILL, CRADLE, SHOWTIME_MOMENTUM } from './HoopsDunks';
import type { StickTrick, TrickSpec, TrickJudge } from './DunkTrickStick';
import { FLICK_MIN } from './DunkTrickStick';

/** The one-hand flush (the contest's flush, 0.5 s): the everyday one-hand slam the family stick asks for UP. */
export const ONE_HAND: HoopsDunk = { clip: 'dunk_flush_one', label: 'ONE-HAND FLUSH', sec: 0.5, flashy: false };
/** The putback slam: a two-hand flush straight off the board. */
export const PUTBACK_DUNK: HoopsDunk = { clip: 'dunk_finish_two_hand', label: 'PUTBACK SLAM', sec: 0.55, flashy: true };
/** The alley-oop, caught and flushed with both hands. */
export const ALLEY_OOP: HoopsDunk = { clip: 'dunk_flush_two', label: 'ALLEY-OOP', sec: 0.5, flashy: true };

/** The takeoff's share of the flight (0..1) in which the stick names the family — closed well before the trick window (k 0.30). */
export const FAMILY_PICK_K = 0.18;
/** The family the right stick names, or null (not pushed): up one hand, down two hands, right the windmill, left the cradle. `y` is the
 *  raw stick (UP IS NEGATIVE, DunkTrickStick's convention). */
export function familyFromStick(x: number, y: number): HoopsDunk | null {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (Math.max(ax, ay) < FLICK_MIN) return null;
  if (ay >= ax) return y < 0 ? ONE_HAND : STANDING;
  return x > 0 ? WINDMILL : CRADLE;
}

/** The rival goes up for the slam off his own offensive board at the iron this share of the time (FEEL NUMBER, new). */
export const PUTBACK_AI_DUNK = 0.5;
/** Does this offensive board go straight back up as a putback DUNK? `atIron`: the tip-in's geometry (TipIn.isTipInEligible). */
export function putbackDunkOn(r: { offensive: boolean; atIron: boolean; who: 'me' | 'foe'; sprintHeld: boolean; roll: () => number }): boolean {
  if (!r.offensive || !r.atIron) return false;
  return r.who === 'me' ? r.sprintHeld : r.roll() < PUTBACK_AI_DUNK;
}

/** A cut this hard at the rim, this far out, gets the lob when he calls for the ball (FEEL NUMBERS, new). */
export const OOP_MIN_SPEED = 3.0, OOP_MIN_M = 1.5, OOP_MAX_M = 6.5, OOP_CUT_COS = 0.6;
/** Is the hero CUTTING at the rim — fast, inside the band, his travel on the rim? */
export function oopCut(pos: { x: number; z: number }, vel: { x: number; z: number }, rimFloor: { x: number; z: number }): boolean {
  const dx = rimFloor.x - pos.x, dz = rimFloor.z - pos.z, d = Math.hypot(dx, dz), sp = Math.hypot(vel.x, vel.z);
  if (d < OOP_MIN_M || d > OOP_MAX_M || sp < OOP_MIN_SPEED) return false;
  return (vel.x * dx + vel.z * dz) / (sp * d) > OOP_CUT_COS;
}

/** The dunk contest's four, on the trick stick's four directions (tomahawk ↔ the 360 windmill, between the legs ↔ the scorpion, windmill ↔
 *  the behind-the-back, cradle ↔ the 720). FEEL NUMBERS (new): worth more than the game's four on a green, and they cost more missed. */
export const CONTEST_TRICK: Readonly<Record<StickTrick, TrickSpec>> = {
  tomahawk:    { clip: 'dunk_360_windmill', label: '360 WINDMILL!',     pctBonus: 0.10, pctPenalty: 0.50 },
  betweenLegs: { clip: 'dunk_scorpion',     label: 'SCORPION!',         pctBonus: 0.16, pctPenalty: 0.62 },
  windmill:    { clip: 'dunk_behind_back',  label: 'BEHIND THE BACK!',  pctBonus: 0.14, pctPenalty: 0.58 },
  cradle:      { clip: 'dunk_720_spin',     label: '720!',              pctBonus: 0.16, pctPenalty: 0.62 },
};
/** A breakaway: nobody in the flight's path (the drive contest found no body), and nobody within this of me at the takeoff (m). */
export const BREAKAWAY_CLEAR_M = 3.0;
/** The contest's tricks come out on a breakaway with the game going my way (the showtime gate). */
export function contestTricksOn(r: { contested: boolean; nearestDefenderM: number; momentum01: number }): boolean {
  return !r.contested && r.nearestDefenderM >= BREAKAWAY_CLEAR_M && r.momentum01 >= SHOWTIME_MOMENTUM;
}
/** A trick's make chance from the base, its spec and the timing (DunkTrickStick.trickPct, for any spec). */
export function trickPctFor(base: number, spec: TrickSpec, judge: TrickJudge): number {
  const out = judge === 'green' ? base + spec.pctBonus : base - spec.pctPenalty;
  return Math.max(0.05, Math.min(0.98, out));
}
