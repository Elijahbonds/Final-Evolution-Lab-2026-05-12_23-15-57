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
  /** IMPROVE (2026-10-06, Penalty #5): down the middle — a low drive or the Panenka chip. A centre kick's run-up runs
   *  nearly straight (`lean`), which is its tell. */
  centre: boolean;
  /** The Panenka: the chipped kick (PenaltyKick.launchKick's chip) — it floats to ~1.8 m and takes ~0.9 s. */
  chip: boolean;
  /** IMPROVE (2026-10-06, Penalty #6): the kick's power (launchKick power01) and the run-up's length (s). */
  power01: number;
  runupSec: number;
  /** How far (m) the run-up drifts toward `tellSign` by the strike. */
  lean: number;
}

export const GOAL_HALF_WIDTH = 3.66;
/** How often the run-up tells the truth, by shootout phase. */
export const TELL_HONESTY = { regulation: 0.7, suddenDeath: 0.58 } as const;
/**
 * IMPROVE (2026-10-06, Penalty #5 / #6). TUNED: the rival's kick was always a corner (1.6–3.1 m) at power 0.72 off a
 * 1.15 s run-up, so staying up was never right and the strike instant was learnable after one kick.
 *   centreShare  0 → 0.12   — about one kick in eight goes down the middle; half of those are the Panenka chip.
 *   power        0.72 → 0.64–0.82 (a centre drive 0.70–0.82) — every value under PenaltyKick.OVER_BAR_FROM 0.88.
 *   runup        1.15 s → 1.0–1.3 s — the pace alone barely moves the strike (0.42–0.47 s to the line, measured), and
 *                the dive is graded against the strike, so the run-up's length is what makes the strike instant unlearnable.
 *   lean         0.55 m on a corner (honest or the feint) → 0.2 m on a centre kick: the straight run-up is the tell.
 */
export const RIVAL_KICK = {
  centreShare: 0.12, centreHalfX: 0.4, panenkaShare: 0.5,
  power: [0.64, 0.82] as readonly [number, number], centrePower: [0.7, 0.82] as readonly [number, number],
  runupSec: [1.0, 1.3] as readonly [number, number],
  cornerLean: 0.55, centreLean: 0.2,
} as const;

export function planRivalKick(rand: () => number, suddenDeath: boolean): RivalKickPlan {
  const side: -1 | 1 = rand() < 0.5 ? -1 : 1;
  const corner = 1.6 + rand() * 1.5;                 // 1.6..3.1 — inside the post
  const honest = rand() < (suddenDeath ? TELL_HONESTY.suddenDeath : TELL_HONESTY.regulation);
  const aimX = side * corner;
  const aimY = 0.4 + rand() * 1.6;
  // the rolls the corner plan always made come first, in their old order (a seeded sequence still plans the same corner)
  const R = RIVAL_KICK;
  const lerp = (r: readonly [number, number], u: number) => r[0] + (r[1] - r[0]) * u;
  const centre = rand() < R.centreShare;
  const runupSec = lerp(R.runupSec, rand());
  if (centre) {
    const x = (rand() * 2 - 1) * R.centreHalfX;
    const chip = rand() < R.panenkaShare;
    return {
      aimX: x, tellSign: side, feint: false, aimY: chip ? 1.8 : 0.3 + rand() * 0.4,
      centre: true, chip, power01: lerp(R.centrePower, rand()), runupSec, lean: R.centreLean,
    };
  }
  return {
    aimX, tellSign: honest ? side : (side === 1 ? -1 : 1), feint: !honest, aimY,
    centre: false, chip: false, power01: lerp(R.power, rand()), runupSec, lean: R.cornerLean,
  };
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

export interface SaveResult { saved: boolean; why: 'reach' | 'wrong_way' | 'stayed' | 'off_target' | 'too_slow' | 'middle' | 'over' | 'under' }

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

// ── IMPROVE (2026-10-06, Penalty #7): the read in two dimensions ─────────────────────────────────────────────────────
/** Beyond ◀ / ▶: ▼ STAY — set big in the middle; ▲ SPRING — up for the top of the middle. Timed against the strike like
 *  the dive. */
export type CentreCall = 'stay' | 'high';
export type KeeperCall = DiveSign | CentreCall;
/**
 * What the centre calls cover (m from the middle, and the height band):
 *   ▼ stay: perfect 1.6 / good 1.4 / otherwise 1.1, up to 1.6 m high — a chip over a set keeper beats him ('over').
 *   ▲ spring: perfect 1.9 / good 1.6 / otherwise 1.2, from 0.8 m up — a low drive under a springing keeper beats him.
 * A committed side dive (perfect / good / early) has left the middle: a ball inside LEAVES_MIDDLE_M of it goes in.
 */
export const CENTRE_CALL = {
  stayReach: { perfect: 1.6, good: 1.4, other: 1.1 }, stayMaxY: 1.6,
  highReach: { perfect: 1.9, good: 1.6, other: 1.2 }, highMinY: 0.8,
} as const;
export const LEAVES_MIDDLE_M = 0.45;

/**
 * The keeper round's save with the centre calls. ◀ / ▶ and no call are resolveSave's (unchanged — carnival's Hot Shot
 * keeper reads it as it was), except that a committed dive no longer saves a ball down the middle.
 */
export function resolveSaveRead(call: KeeperCall, timing: DiveTiming, ballX: number, ballY: number): SaveResult {
  if (Math.abs(ballX) > GOAL_HALF_WIDTH || ballY > 2.44 || ballY < 0) return { saved: false, why: 'off_target' };
  const band = timing === 'perfect' ? 'perfect' : timing === 'good' ? 'good' : 'other';
  if (call === 'stay') {
    if (Math.abs(ballX) > CENTRE_CALL.stayReach[band]) return { saved: false, why: 'stayed' };
    return ballY <= CENTRE_CALL.stayMaxY ? { saved: true, why: 'reach' } : { saved: false, why: 'over' };
  }
  if (call === 'high') {
    if (Math.abs(ballX) > CENTRE_CALL.highReach[band]) return { saved: false, why: 'stayed' };
    return ballY >= CENTRE_CALL.highMinY ? { saved: true, why: 'reach' } : { saved: false, why: 'under' };
  }
  const committed = timing === 'perfect' || timing === 'good' || timing === 'early';
  if (call !== 0 && committed && Math.abs(ballX) <= LEAVES_MIDDLE_M) return { saved: false, why: 'middle' };
  return resolveSave(call, timing, ballX, ballY);
}
