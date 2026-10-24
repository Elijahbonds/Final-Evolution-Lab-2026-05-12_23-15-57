// HOOPS NB-3, REBUILT (lane/hoops-overtime, owner 2026-10-23) — a 3v3 level at the buzzer goes to SUDDEN-DEATH OVERTIME.
//
// Why: the hoops grade (0d16f5dd) saw ROOKIE-r1 end 10–10 at the horn and post won:false with no tiebreak, under a hub that said
// "First to 21" for a game on a 90-second clock. PR #268 fixed it on a release ~280 commits older; this is the same rule on the
// current mode (the ELITE shot clock, momentum, the feel knobs, the moves combo, the defense shade, the end-card score fix).
//
// THE RULE (FIBA 3x3's overtime, which is "first to 2 points" — every bucket here is a 2 or a 3, so it is the next bucket):
//   · level at the horn, nothing in the air → OVERTIME, not a result. A fresh check (OVERTIME_BALL), a fresh game clock
//     (OVERTIME_3V3_SEC), the horn re-armed; the fresh possession resets ELITE's shot clock (it reads the possession token);
//   · in overtime the first bucket ends it, as soon as nothing is still in the air — a WIN or a LOSS, never a draw;
//   · level again when the overtime clock runs out → another overtime (OT2, OT3 …);
//   · first to 21 still ends any game outright.
//
// THE CEILING: a tie at the horn is at most 20–20 (21 ends the game where it is scored), and overtime adds exactly one bucket,
// so an overtime game posts at most 20 + 3 = 23 — the same `firstToCeiling(21, 3)` the Arena and /api/sessions already hold
// (lib/arena-score-integrity.ts SCORE_CEILINGS.hoops3v3). threevthreeOvertime.test.ts pins the two together.
//
// Pure: no scene. The mode asks hornCall() once a frame; the host and the proof line read the labels.

import { feel } from '../../feel-panel/feel';   // feel-panel knob hoops.overtime3v3Sec (a playtest run only; never ranked/staked)

/** (new) The overtime's game clock, in seconds — PR #268's 30. Feel knob `hoops.overtime3v3Sec`. */
export const OVERTIME_3V3_SEC = 30;
/** The banner the overtime opens with, and how long it holds (ms). */
export const OVERTIME_BANNER = 'OVERTIME — NEXT BUCKET WINS';
export const OVERTIME_BANNER_MS = 1600;
/** Who checks it up to open an overtime. `'me'`: your team, a fresh check (assumption — owner call: FIBA gives it to the side
 *  that did not open the game, which here is always them). */
export const OVERTIME_BALL: 'me' | 'them' = 'me';

/** This run's overtime length (the shipped constant unless the owner's feel panel is open on a playtest run). */
export function overtimeSec(): number {
  return feel('hoops.overtime3v3Sec', OVERTIME_3V3_SEC);
}

export interface HornFrame {
  /** The game clock has run out (regulation's or an overtime's). */
  buzzer: boolean;
  /** The game is in overtime. */
  overtime: boolean;
  /** A ball is still in the air / a shot or dunk still resolving — it counts, so nothing is decided yet. */
  live: boolean;
  my: number;
  foe: number;
}
/** 'play' = carry on; 'overtime' = start one now; 'WIN' / 'LOSS' = the game is over. */
export type HornCall = 'play' | 'overtime' | 'WIN' | 'LOSS';

/** What the clock and the score say this frame. */
export function hornCall(f: HornFrame): HornCall {
  if (f.live) return 'play';
  if (f.overtime && f.my !== f.foe) return f.my > f.foe ? 'WIN' : 'LOSS';   // sudden death: the first bucket
  if (!f.buzzer) return 'play';
  if (f.my === f.foe) return 'overtime';                                     // a tie is not a result
  return f.my > f.foe ? 'WIN' : 'LOSS';
}

/** The most an overtime game can post: a tie under the target, plus one bucket. */
export function overtimeScoreMax(target: number, bucketMax: number): number {
  return target - 1 + bucketMax;
}

/** The period's name: '' in regulation, 'OT' for the first overtime, 'OT2', 'OT3' … after. */
export function periodLabel(overtimes: number): string {
  const n = Math.max(0, Math.floor(overtimes));
  return n <= 0 ? '' : n === 1 ? 'OT' : `OT${n}`;
}

/** The end card's headline for a game that went to overtime (null = regulation: the host's own words). */
export function overtimeHeadline(won: boolean, overtimes: number): string | null {
  const p = periodLabel(overtimes);
  return p ? `${won ? 'WON' : 'LOST'} IN ${p}` : null;
}
