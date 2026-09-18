// WHAT A DUNK IS WORTH, GIVEN WHAT IT COST YOU TO GET IT (2026-09-14).
//
// Two owner decisions, and they are one module because they only work together.
//
//   P2 — THREE ATTEMPTS, GROWING PENALTY. A blown dunk used to be judged low and the contest moved on.
//        Real contests give you three tries and the drama is in SPENDING them: the crowd noise on attempt
//        three is the event. Landing it on the third is still worth something and never worth what the
//        first was.
//
//   P5 — CALLING YOUR DUNK IS OPTIONAL AND PAYS. You may declare a trick before the run. Land it and the
//        difficulty pays a bonus; fail it and it costs more than an uncalled miss. Not calling is always
//        legal, so nobody is blocked — it is a risk you opt into.
//
// WHY ONE MODULE. Attempts without a called shot is just more retries, and a called shot without attempts
// is a single coin-flip. The tension is the product of the two: calling the Eastbay on attempt one is
// brave, and calling it on attempt three is a different decision entirely, because the penalties multiply.
//
// THE INVARIANT THAT SHAPES THE NUMBERS — and it is the same one RivalNerve and Nerve are built around,
// pointed at the player this time:
//
//   CALLING YOUR SHOT MUST NEVER BE FREE, AND NEVER BE STRICTLY BETTER THAN NOT CALLING.
//
// If the bonus for landing a called dunk exceeds what failing one costs, calling is not a gamble, it is a
// button that says "more points" and every player will hold it every time. So the miss scale is set
// further from 1 than the bonus is, and a test sweeps every attempt/called/landed combination asserting
// that a caller never out-earns a non-caller on the same outcome unless they actually landed the call.
//
// Pure: no Babylon, no clock, no randomness. It scales a judged score; the judges still judge.

/** Tries at one dunk before the contest moves on. Owner decision: NBA rules. */
export const ATTEMPTS_PER_DUNK = 3;

/**
 * What the judged score is multiplied by, per attempt used.
 *
 * Index 0 is the first attempt. Never reaches zero: a dunk landed on the third try is still a dunk, and a
 * scale of 0 would make the last attempt pointless to even take.
 */
export const ATTEMPT_SCALE: readonly number[] = [1, 0.85, 0.7];

/** Landed the trick you called. */
export const CALL_BONUS = 1.2;
/** Called a trick and did not land it. Further from 1 than the bonus is — see the invariant. */
export const CALL_MISS_SCALE = 0.75;

export interface Stakes {
  /** Attempts already spent on THIS dunk. 0 before the first one is taken. */
  attemptsUsed: number;
  /** The trick id the player declared before the run, or null if they did not call one. */
  called: string | null;
}

export const FRESH_STAKES: Stakes = { attemptsUsed: 0, called: null };

/** A new dunk: attempts back, and the call cleared — a call belongs to one dunk, not to the round. */
export function freshStakes(): Stakes {
  return { ...FRESH_STAKES };
}

/** Declare a trick. Passing null clears the call, which is how a player backs out before the run. */
export function call(s: Stakes, trickId: string | null): Stakes {
  return { ...s, called: trickId && trickId.trim() ? trickId : null };
}

/** One more try gone. */
export function spendAttempt(s: Stakes): Stakes {
  return { ...s, attemptsUsed: Math.min(ATTEMPTS_PER_DUNK, s.attemptsUsed + 1) };
}

export function attemptsLeft(s: Stakes): number {
  return Math.max(0, ATTEMPTS_PER_DUNK - s.attemptsUsed);
}

/**
 * May the player try this dunk again?
 *
 * Only a MISS can be retried. A dunk that went down is finished whatever attempts are left — otherwise a
 * player would re-roll a made dunk hoping for better judges, which is not a contest, it is a slot machine.
 */
export function canRetry(s: Stakes, made: boolean): boolean {
  return !made && attemptsLeft(s) > 0;
}

/** The multiplier for the attempt that was used. `attemptsUsed` is 1-based here: the attempt just taken. */
export function attemptScale(attemptsUsed: number): number {
  if (!Number.isFinite(attemptsUsed) || attemptsUsed <= 1) return ATTEMPT_SCALE[0];
  const i = Math.min(ATTEMPT_SCALE.length, Math.round(attemptsUsed)) - 1;
  return ATTEMPT_SCALE[i];
}

/**
 * Everything the stakes do to a judged score.
 *
 * `landedTrickIds` is what actually fired in the air, so a called trick counts only if it was thrown AND
 * the dunk went down — calling the Eastbay, throwing it, and then missing the flush is a failed call.
 */
export function stakesScale(s: Stakes, landedTrickIds: readonly string[], made: boolean): number {
  const attempt = attemptScale(s.attemptsUsed);
  if (!s.called) return attempt;
  const landed = made && landedTrickIds.includes(s.called);
  return attempt * (landed ? CALL_BONUS : CALL_MISS_SCALE);
}

/** Whether the call was honoured — for the banner, so a mode cannot decide it differently from the score. */
export function callLanded(s: Stakes, landedTrickIds: readonly string[], made: boolean): boolean {
  return !!s.called && made && landedTrickIds.includes(s.called);
}

/**
 * What calling this dunk is worth, in words, BEFORE the run.
 *
 * From the review: "the called dunk is a blind bet — you commit on L1 with no idea what landing it pays or
 * what failing it costs, which makes the most interesting decision in the mode a guess the first several
 * times." A risk you cannot price is not a decision, it is a dare. The numbers were always here.
 */
export function callPreview(trickLabel: string): string {
  const up = Math.round((CALL_BONUS - 1) * 100);
  const down = Math.round((1 - CALL_MISS_SCALE) * 100);
  return `CALLING ${trickLabel} · LAND IT +${up}% · MISS IT −${down}%`;
}

/** The bezel's attempt chip: "1 OF 3", and the called trick when there is one. */
export function stakesLabel(s: Stakes, calledLabel?: string): string {
  const n = Math.min(ATTEMPTS_PER_DUNK, Math.max(1, s.attemptsUsed + 1));
  const attempt = `${n} OF ${ATTEMPTS_PER_DUNK}`;
  return calledLabel ? `${attempt} · CALLED ${calledLabel}` : attempt;
}
