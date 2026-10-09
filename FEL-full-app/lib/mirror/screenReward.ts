// screenReward — what a completed movement screen is worth, and when it is worth nothing.
//
// Owner, 2026-09-19: both scans pay shards, body scan first. The wallet already had everything needed — a
// server-granted, idempotent reward path with per-day caps (lib/wallet) — and nothing in the Mirror or Kitchens ever
// called it. Same shape as the card QR and the coach invite: the machinery existed, the join did not.
//
// THE RULE THAT MATTERS: a screen the camera could not grade pays NOTHING. The reward is for the measurement, not
// for standing near a phone. Paying for a provisional screen would teach an athlete that the fastest shards come
// from a bad shot, which is the exact opposite of what a screening tool wants from them.
//
// Idempotency is per ATHLETE per SCREEN, not per day: the key is the athlete's id and the screen's own id, so a
// retry, a double-tap or a reconnect pays once, while a genuinely new screen tomorrow pays again — up to the
// wallet's daily cap, which exists so that squatting at a camera is never a faucet.
// MIRROR-COACH P1 (2026-09-25) — A SCREEN NOTHING GRADED IS NOT A BAD SHOT. No production code calls
// ScreenRunner.record yet (the graders are phase 3), so every screen arrived with zero checks, the harness marked it
// provisional, and the athlete was told "Not enough of that was in frame to grade … Step back and run it again": a
// retry loop that could never succeed, blaming their framing for a grader that does not exist. Zero checks is now its
// own answer, decided FIRST — no pay, no score, no retry prompt — and the framing message is kept for a screen the
// camera genuinely could not see. (MIRROR-COACH P3 review, 2026-09-26: that framing message was the retry loop again
// once P3's graders made "provisional" reachable; it is gone — PROVISIONAL_LINE, or the camera's own reasons via
// ScreenRewardInput.readLine.)
import { REASON } from '@/lib/wallet/reward-rules';
import { NOT_GRADED_LINE } from './screen';

export interface ScreenRewardDecision {
  /** Whether to call the grant path at all. */
  pay: boolean;
  reasonCode: string;
  /** Stable per screen, so a replay cannot pay twice. */
  idempotencyKey: string;
  /** What to tell the athlete either way. */
  message: string;
}

export interface ScreenRewardInput {
  screenId: string;
  athleteId: string;
  /** From the assessment: a screen below the confidence bar was not graded. */
  provisional: boolean;
  /** How many checks actually came back. A screen that measured nothing is not a screen. */
  checksTaken: number;
  /**
   * What the camera read and why the rest was not read, in the athlete's words (lib/mirror/screenClaims.ts
   * screenReadLine) — said instead of the fixed lines below for a provisional or unread screen (MIRROR-COACH P3 review,
   * 2026-09-26).
   */
  readLine?: string;
  /**
   * The athlete pressed End before every camera station had been attempted (screenClaims.ts endedEarly — End posts what
   * was read so far since the MIRROR-COACH P3 follow-up, 2026-09-28). See ENDED_EARLY_LINE.
   */
  endedEarly?: boolean;
}

/**
 * AN ENDED SCREEN IS KEPT AND SCORED, AND DOES NOT PAY — UNTIL THE OWNER DECIDES (MIRROR-COACH P3 follow-up review,
 * 2026-09-28). Owner decision #31 fixed the bar (>= 3 readable checks from >= 2 stations) when only a screen that reached
 * its last station was ever posted. The follow-up made End post what was read so far, and End after the first two
 * stations (~26 s of holds) cleared that bar and paid the full MOVEMENT_SCREEN_COMPLETED reward — beside this file's own
 * "a couple of stations is not a screen", and twice a day under the wallet's cap with a new screen id each Start.
 * Whether an ended screen pays is the owner's call, not this lane's: until they make it, a post marked `ended` pays only
 * when every camera station was at least attempted (a grade, read or not, from each) — what a screen that reached the
 * end always has — and says why otherwise. The bar itself is unchanged for every screen that runs to the end.
 */
export const ENDED_EARLY_LINE = 'Ended before the last station: what was read is kept and scored. A screen pays when it is run to the end.';

/**
 * A provisional screen, when no line from the camera's own reasons came with it. MIRROR-COACH P3 review (2026-09-26): it
 * was "Not enough of that was in frame to grade, so it does not count yet. Step back and run it again." — P1 made that
 * unreachable, P3 made it reachable again (provisional = under three checks read), and it was said aloud after a screen
 * whose reasons were "come a little closer" or "more light": the same phone gives the same screen, so it sent the
 * athlete round the whole screen again — the loop P1 removed. No retry prompt, no framing advice it cannot back.
 */
export const PROVISIONAL_LINE = 'Too little of that screen was read to count as a screen, so it pays nothing this time.';

/** A screen has to have actually measured something. One station does not make a screen. */
export const MIN_CHECKS_FOR_REWARD = 3;

export function decideScreenReward(input: ScreenRewardInput): ScreenRewardDecision {
  // THE KEY CARRIES THE ATHLETE. Ledger idempotency keys are unique across the WHOLE table, so a key built from
  // the screen id alone would collide between two people the moment a client generated the same id twice — and
  // the second athlete would be handed the first one's ledger entry instead of a payout. `athleteId` was already
  // on this input and went unused, which is what that field was always for.
  const key = `screen:${input.athleteId}:${input.screenId}`;
  if (input.checksTaken <= 0) {
    return { pay: false, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key, message: input.readLine || NOT_GRADED_LINE };
  }
  if (input.provisional) {
    return { pay: false, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key, message: input.readLine || PROVISIONAL_LINE };
  }
  if (input.endedEarly) {
    return { pay: false, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key, message: ENDED_EARLY_LINE };
  }
  if (input.checksTaken < MIN_CHECKS_FOR_REWARD) {
    return {
      pay: false, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key,
      message: 'Finish the screen to earn from it — a couple of stations is not a screen.',
    };
  }
  return {
    pay: true, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key,
    message: 'Screen logged. Shards are in your wallet.',
  };
}
