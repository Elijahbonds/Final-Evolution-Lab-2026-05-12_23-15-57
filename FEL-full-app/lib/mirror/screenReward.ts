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
import { REASON } from '@/lib/wallet/reward-rules';

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
}

/** A screen has to have actually measured something. One station does not make a screen. */
export const MIN_CHECKS_FOR_REWARD = 3;

export function decideScreenReward(input: ScreenRewardInput): ScreenRewardDecision {
  // THE KEY CARRIES THE ATHLETE. Ledger idempotency keys are unique across the WHOLE table, so a key built from
  // the screen id alone would collide between two people the moment a client generated the same id twice — and
  // the second athlete would be handed the first one's ledger entry instead of a payout. `athleteId` was already
  // on this input and went unused, which is what that field was always for.
  const key = `screen:${input.athleteId}:${input.screenId}`;
  if (input.provisional) {
    return {
      pay: false, reasonCode: REASON.MOVEMENT_SCREEN_COMPLETED, idempotencyKey: key,
      message: 'Not enough of that was in frame to grade, so it does not count yet. Step back and run it again.',
    };
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
