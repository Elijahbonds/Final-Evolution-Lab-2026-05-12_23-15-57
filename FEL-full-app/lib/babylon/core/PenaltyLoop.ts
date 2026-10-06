// PenaltyLoop — the pure reads of the live shootout loop (PenaltyMode in modes/precisionModes.ts).
//
// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Penalty): what was inline in the mode, wrong, or missing, pulled
// out so it is tested and the mode reads it:
//   #2  the breakaway's hint — the clock it names is BREAK.clockSec (it said 9 s of an 11 s clock), and the corner is
//       your distance to the ball at the strike, not the stick (it said "stick = the corner");
//   #3  CLASSIC PENS — the place kick from the spot (feints, the aim ring, the power wave) as a pick beside the breakaway;
//   #4  the keeper's read of your habit, said out loud in the breakaway (the warning lived only in the unreachable aim);
//   #9  the result beats after each kick, skippable with A once they have been up long enough to read.

import { keeperReadProb } from './ShootoutCore';
import type { TimerBag } from './GolfLoop';

// ── #3 the pick ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type PensStyle = 'breakaway' | 'classic';
export const PENS_KEY = 'fel-pens-style';
/** Y switches the kick's style while the breakaway's clock still has this much of its first stretch left (a switch is
 *  a fresh start of the same kick, so it is offered before the run has gone anywhere), or any time in the classic aim. */
export const PENS_SWITCH_SEC = 2;

/** `?pens=classic` (or `breakaway`) wins, then the remembered pick, then the breakaway. */
export function readPensStyle(search?: string): PensStyle {
  try {
    const q = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : '')).get('pens');
    if (q === 'classic' || q === 'breakaway') return q;
    if (typeof window !== 'undefined' && window.localStorage.getItem(PENS_KEY) === 'classic') return 'classic';
  } catch { /* convenience only */ }
  return 'breakaway';
}
export function writePensStyle(s: PensStyle): void {
  try { window.localStorage.setItem(PENS_KEY, s); } catch { /* convenience only */ }
}

// ── #4 the read ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The keeper's read at or past this is said (the classic aim's own threshold). */
export const READ_WARN_P = 0.75;
/** The side the keeper is reading hard off your last kicks (−1 left, +1 right), or 0. */
export function habitRead(history: readonly number[]): -1 | 0 | 1 {
  const last = history[history.length - 1];
  if (!last) return 0;
  const side = last > 0 ? 1 : -1;
  return keeperReadProb(side, history.slice(), 0) >= READ_WARN_P ? side : 0;
}

// ── #2 the hint ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface BreakawayHintIn {
  clockSec: number;
  /** The shootout's pressure line, when there is one (sudden death, score-or-out). */
  pressure?: string | null;
  readSide?: -1 | 0 | 1;
}
/**
 * The breakaway's line. The shot's corner is read off the distance from the ball at the strike (precisionModes strikeNow):
 * off the dribble (0.9 m ahead) it goes through the middle; a loose ball tight to you goes low left, one at full reach
 * high right; the stick held up chips it.
 */
export function breakawayHint(o: BreakawayHintIn): string {
  const read = o.readSide ? `HE'S READING YOUR ${o.readSide < 0 ? 'LEFT' : 'RIGHT'} — vary it · ` : '';
  const pressure = o.pressure ? `${o.pressure} · ` : '';
  return `${pressure}${read}BREAKAWAY — ${o.clockSec} s · run at him · A shoots (off the dribble = the middle; a loose ball tight = low left, at full reach = high right; stick up = the chip) · LT slide · R1 banks it off the glass · Y classic pens`;
}
export const CLASSIC_HINT = 'CLASSIC PENS — snap the stick side-to-side to FEINT (max 2) · aim · A runs up, A again KICKS at the top · Y breakaway';

// ── #9 the result beat ───────────────────────────────────────────────────────────────────────────────────────────────
/** TUNED (2026-10-06): A skips a result beat once it has been up this long (s) — long enough to read SAVED / GOAL, and a
 *  strike press that lands on the result frame is not taken as a skip. */
export const RESULT_SKIP_MIN_SEC = 0.35;
/** One pending result beat: its continuation runs when its time is up, or now on A (skip). */
export class ResultBeat {
  private id: ReturnType<typeof setTimeout> | null = null;
  private next: (() => void) | null = null;
  private at = 0;
  constructor(private readonly timers: TimerBag) {}
  /** Hold `ms`, then run `next`. `nowSec` is the mode's game clock. */
  hold(nowSec: number, ms: number, next: () => void): void {
    this.cancel();
    this.at = nowSec; this.next = next;
    this.id = this.timers.later(() => { this.id = null; this.run(); }, ms);
  }
  get pending(): boolean { return this.next !== null; }
  /** A pressed: run the continuation now, if the beat has been up RESULT_SKIP_MIN_SEC. True when it skipped. */
  skip(nowSec: number): boolean {
    if (!this.next || nowSec - this.at < RESULT_SKIP_MIN_SEC - 1e-9) return false;   // (float dust: a summed clock)
    this.timers.cancel(this.id); this.id = null;
    this.run();
    return true;
  }
  cancel(): void { this.timers.cancel(this.id); this.id = null; this.next = null; }
  private run(): void { const n = this.next; this.next = null; n?.(); }
}
