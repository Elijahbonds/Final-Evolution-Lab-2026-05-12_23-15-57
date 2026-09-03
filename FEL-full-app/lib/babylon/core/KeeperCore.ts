// KeeperCore — the keeper round (owner decision 2026-09-03): on the rival's
// kick the human plays goalkeeper. Pure so the read/dive/save rules are
// unit-tested and shared between the mode and its headless checks.
//
//   THE READ  — the kicker's run-up leans toward a side. Most of the time that
//               is where the ball goes; sometimes it is a feint. The lean is
//               the tell; its honesty is what makes it a read, not a guess.
//   THE DIVE  — ◀ / ▶ (or nothing = stay). Timing is graded like a swing:
//               a dive at the strike reaches the corner; a late dive reaches
//               the middle only; an early dive commits and the ball goes the
//               other way if the tell was a feint.
//   THE SAVE  — the ball is saved when it lands within the keeper's reach on
//               the side they dived to (or the centre if they stayed).

export type DiveSign = -1 | 0 | 1;
export type DiveTiming = 'perfect' | 'good' | 'early' | 'late' | 'none';

export interface RivalKickPlan {
  /** Where the ball is going (m from the centre of the goal, ± = sides). */
  aimX: number;
  /** Which way the run-up leans (the tell). Equals sign(aimX) unless it is a feint. */
  tellSign: -1 | 1;
  feint: boolean;
  /** Ball height at the line, m. */
  aimY: number;
}

export const GOAL_HALF_WIDTH = 3.66;
/** How often the run-up tells the truth, by shootout phase. */
export const TELL_HONESTY = { regulation: 0.7, suddenDeath: 0.58 } as const;

export function planRivalKick(rand: () => number, suddenDeath: boolean): RivalKickPlan {
  const side: -1 | 1 = rand() < 0.5 ? -1 : 1;
  const corner = 1.6 + rand() * 1.5;                 // 1.6..3.1 — inside the post
  const honest = rand() < (suddenDeath ? TELL_HONESTY.suddenDeath : TELL_HONESTY.regulation);
  const aimX = side * corner;
  return { aimX, tellSign: honest ? side : (side === 1 ? -1 : 1), feint: !honest, aimY: 0.4 + rand() * 1.6 };
}

/** Grade the dive tap against the strike instant (seconds; negative = before). */
export function gradeDive(dtSec: number | null): DiveTiming {
  if (dtSec == null) return 'none';
  const a = Math.abs(dtSec);
  if (a <= 0.09) return 'perfect';
  if (a <= 0.22) return 'good';
  return dtSec < 0 ? 'early' : 'late';
}

/** Lateral reach (m from the keeper's centre) a dive of this timing covers. */
export function diveReach(timing: DiveTiming): number {
  switch (timing) {
    case 'perfect': return 3.2;   // the corner
    case 'good': return 2.4;
    case 'early': return 2.4;     // full stretch, but committed before the strike
    case 'late': return 1.3;
    default: return 0.9;          // standing: the middle only
  }
}

export interface SaveResult { saved: boolean; why: 'reach' | 'wrong_way' | 'stayed' | 'off_target' | 'too_slow' }

export function resolveSave(dive: DiveSign, timing: DiveTiming, ballX: number, ballY: number): SaveResult {
  if (Math.abs(ballX) > GOAL_HALF_WIDTH || ballY > 2.44 || ballY < 0) return { saved: false, why: 'off_target' };
  const reach = diveReach(timing);
  if (dive === 0) {
    return Math.abs(ballX) <= reach ? { saved: true, why: 'reach' } : { saved: false, why: 'stayed' };
  }
  if (Math.sign(ballX) !== dive && Math.abs(ballX) > 0.6) return { saved: false, why: 'wrong_way' };
  if (Math.abs(ballX) <= reach) return { saved: true, why: 'reach' };
  return { saved: false, why: 'too_slow' };
}
