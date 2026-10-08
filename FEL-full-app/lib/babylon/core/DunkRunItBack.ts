// DunkRunItBack — THE BLOOPER AND THE QUICK RETRY (dunk-next phase 8, 2026-10-06).
//
// Owner, 2026-10-06: "after a miss, a fast 'RUN IT BACK' retry that skips dead time while keeping the attempt rules (attempts still
// count; no free re-dos on the staked card)."
//
// A miss with an attempt left was a fixed MISS_BEAT_MS (1.4 s) of standing at the rim before the runway came back — whoever you were
// and however fast you wanted to go again (docs/DUNK-NEXT.md §1 row 8: "failure is fast but flat"). Now:
//
//   THE BLOOPER — the miss is called as the clank it was, one line from the booth (BLOOPER_LINES, by what went wrong), with what is
//                 left. Funny, not a lecture: the line after it still says what to fix (DunkMode.missWhy).
//   RUN IT BACK — from RUN_BACK_MIN_MS after the miss (the clank reads first, and the SLAM still being mashed is not a retry), A or a
//                 RUN press (or the phone's chip) goes straight to the runway. Nobody pressing: the beat ends on its own, as before.
//
// THE ATTEMPT RULES ARE NOT TOUCHED. The attempt was spent before this is offered (DunkStakes.spendAttempt), the retry is offered
// only where DunkStakes.canRetry already allowed one, the next attempt is scored at its own lower ATTEMPT_SCALE, and the last miss is
// judged as it always was — there is no RUN IT BACK on it. Nothing here re-does a dunk; it only stops the wait between two that
// were already allowed. So the staked card is what it was: at most four judged dunks, each from at most three attempts.
//
// Pure: no Babylon, no clock.

import { canRetry, attemptsLeft, type Stakes } from './DunkStakes';

/** TUNED (dunk-next phase 8): the miss holds this long (ms) before a press runs it back — the clank and the line read first, and an
 *  A still being thrown at the rim is not taken as a retry. The beat still ends on its own at MISS_BEAT_MS (1.4 s). */
export const RUN_BACK_MIN_MS = 450;

/** Is RUN IT BACK on the table after this attempt? Only a MISS, and only where the stakes already allow a retry (the attempt that
 *  just failed is already spent). The rival's misses run on his own clock. */
export function runBackOffered(s: Stakes, made: boolean, isPlayer: boolean): boolean {
  return isPlayer && canRetry(s, made);
}

/** May a press run it back yet? `sinceMissMs` is the real time since the miss was called. */
export function runBackReady(sinceMissMs: number): boolean {
  return Number.isFinite(sinceMissMs) && sinceMissMs >= RUN_BACK_MIN_MS;
}

/** The hint under the miss. */
export function runBackHint(s: Stakes): string {
  const n = attemptsLeft(s);
  return `A · RUN IT BACK — ${n} ${n === 1 ? 'ATTEMPT' : 'ATTEMPTS'} LEFT`;
}

/** What went wrong, as the booth hears it. */
export type MissKind = 'prop' | 'lob' | 'early' | 'noSlam';
/** The booth's blooper calls — light, never mean, never the same line twice in a row for the same miss (bloopLine walks them). */
export const BLOOPER_LINES: Readonly<Record<MissKind, readonly string[]>> = {
  prop: ['THE PROP WINS THAT ONE', 'THAT IS GOING ON THE BLOOPER REEL', 'FURNITURE 1, DUNKER 0'],
  lob: ['THE TOSS HAD OTHER PLANS', 'NOBODY HOME FOR THAT LOB', 'THE BALL WENT SOLO'],
  early: ['THE RIM SAID NO', 'IRON 1, DUNKER 0', 'ALL ARM, NO TIMING'],
  noSlam: ['FORGOT THE DUNK PART', 'ALL THAT AIR AND NO FLUSH', 'HE JUST… HUNG OUT UP THERE'],
};

/** The blooper call for a miss: `n` walks the lines (the mode passes how many misses it has called tonight), so two in a row differ. */
export function bloopLine(kind: MissKind, n: number): string {
  const lines = BLOOPER_LINES[kind] ?? BLOOPER_LINES.early;
  const i = Number.isFinite(n) ? Math.abs(Math.floor(n)) % lines.length : 0;
  return lines[i];
}
