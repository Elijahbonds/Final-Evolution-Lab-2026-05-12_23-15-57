// THE RIVAL HAS TO FEEL THE CONTEST TOO (2026-09-13).
//
// The dunk contest already tracks the pressure the PLAYER is under: `deficit`, `isFinalRound` and the
// walk-off `need` number on the HUD. The rival felt none of it. Its three inputs were fixed random ranges —
//
//     rDiff  = 2.6 + rand*3.4      rExec = 3.4 + rand*3.4      rStyle = 2.2 + rand*3.2
//
// — identical on the first dunk of the contest and on the last dunk with the title on the line, identical
// when it is twenty points up and when it is twenty down. It never went for one, never played it safe and
// never choked, which is most of what a dunk contest actually is to watch.
//
// THE INVARIANT THAT SHAPES THIS FILE: A RIVAL THAT SWINGS BIGGER WHEN TRAILING MUST ALSO MISS MORE.
//
// It is the obvious trap. Give the trailing rival more difficulty and nothing else and falling behind
// becomes strictly better than leading — the AI is rewarded for being beaten, the contest inverts, and a
// player who builds a lead is punished for it. So nerve moves difficulty and risk TOGETHER, always, and
// there is a test that walks every situation asserting the pair never comes apart.
//
// Pure: no Babylon, no clock, no randomness of its own. The mode rolls; this decides what it is rolling on.

/** Where the rival stands, from the rival's point of view. */
export interface RivalSituation {
  /** The rival's total minus the player's. Negative means the rival is behind. */
  deficit: number;
  /** The last round: nothing left to save anything for. */
  isFinalRound: boolean;
  /** Dunks the rival has left, this one included. Zero is treated as one. */
  attemptsLeft: number;
  /**
   * The standard the PLAYER is setting: their average card so far tonight, or 0 before they have posted one.
   *
   * P8 (2026-09-16). Nerve read the SCOREBOARD and nothing else, so a rival could be level on points against a player
   * posting 46s and feel no pressure at all — he was level, so he played his neutral band of 2.6–6.0 and got outscored
   * on every exchange until the deficit arrived. A dunker in a contest does not wait for the scoreboard to tell him the
   * other guy is going big; he watches the dunk. (And the invariant holds: reaching for the player's standard costs the
   * same cleanliness as reaching for any other reason.)
   */
  playerPace?: number;
}

/** What the rival is going to try. The mode rolls inside these. */
export interface RivalPlan {
  /** Difficulty band it attempts. */
  diffMin: number;
  diffMax: number;
  /** How often it blows the attempt outright. */
  blownChance: number;
  /** For the HUD and the log — what the rival is visibly doing. */
  label: string;
}

/** The neutral rival: the numbers the mode used before nerve existed. */
export const BASE_DIFF_MIN = 2.6;
export const BASE_DIFF_MAX = 6.0;
export const BASE_BLOWN = 0.18;

/** A deficit this size or larger is a contest that needs saving. */
export const DESPERATE_MARGIN = 12;
/** A lead this size is comfortable enough to protect. */
export const COMFORTABLE_MARGIN = 12;

/** Nothing may push the rival past a coin flip on blowing it — a rival that mostly misses is not a rival. */
export const MAX_BLOWN = 0.42;
/** Nor below this: a rival that never misses is not one either, and real contests are full of misses. */
export const MIN_BLOWN = 0.08;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * What the rival tries, given where it stands.
 *
 * Four states, and every one of them moves difficulty and risk in the SAME direction:
 *
 *   · DESPERATE — well behind, running out of dunks. Goes for the biggest thing it has and blows it often.
 *   · PUSHING   — behind, or the final round. Reaches, and pays a little for reaching.
 *   · PROTECTING— comfortably ahead with dunks in hand. Takes the safe one; it does not need a 50.
 *   · NEUTRAL   — everything else. The old numbers exactly.
 */
/** A card at or under this needs no answer; at or over PACE_HOT the rival has to go get it. */
export const PACE_COLD = 34, PACE_HOT = 46;
/** How far the player's standard can push the rival's band, and what that reaching costs him. */
export const PACE_REACH = 2.6, PACE_RISK = 0.07;

/** 0..1: how hard the player's own standard is pushing the rival tonight. */
export function pacePressure(playerPace = 0): number {
  if (!playerPace) return 0;
  return Math.max(0, Math.min(1, (playerPace - PACE_COLD) / (PACE_HOT - PACE_COLD)));
}

export function rivalNerve(sit: RivalSituation): RivalPlan {
  const left = Math.max(1, sit.attemptsLeft);
  const trailing = sit.deficit < 0;
  const behindBy = -sit.deficit;
  // The player's standard raises the floor the rival plans from, before the scoreboard is consulted at all.
  const pace = pacePressure(sit.playerPace);
  const lift = (p: RivalPlan): RivalPlan => (pace <= 0 ? p : {
    ...p,
    diffMin: clamp(p.diffMin + PACE_REACH * pace * 0.6, 0, 10),
    diffMax: clamp(p.diffMax + PACE_REACH * pace, 0, 10),
    blownChance: clamp(p.blownChance + PACE_RISK * pace, MIN_BLOWN, MAX_BLOWN),
    label: p.label || (pace > 0.5 ? 'ANSWERING YOU' : ''),
  });

  // running out of road: behind by a lot with little left to fix it
  if (trailing && behindBy >= DESPERATE_MARGIN && left <= 2) {
    return lift({
      diffMin: BASE_DIFF_MIN + 1.6,
      diffMax: clamp(BASE_DIFF_MAX + 2.2, 0, 10),
      blownChance: clamp(BASE_BLOWN + 0.2, MIN_BLOWN, MAX_BLOWN),
      label: 'GOING FOR IT',
    });
  }
  if (trailing || sit.isFinalRound) {
    return lift({
      diffMin: BASE_DIFF_MIN + 0.7,
      diffMax: clamp(BASE_DIFF_MAX + 1.0, 0, 10),
      blownChance: clamp(BASE_BLOWN + 0.08, MIN_BLOWN, MAX_BLOWN),
      label: sit.isFinalRound && !trailing ? 'CLOSING IT OUT' : 'REACHING',
    });
  }
  if (sit.deficit >= COMFORTABLE_MARGIN && left >= 2) {
    return lift({
      diffMin: Math.max(0, BASE_DIFF_MIN - 0.6),
      diffMax: Math.max(0, BASE_DIFF_MAX - 1.4),
      blownChance: clamp(BASE_BLOWN - 0.08, MIN_BLOWN, MAX_BLOWN),
      label: 'PLAYING IT SAFE',
    });
  }
  return lift({ diffMin: BASE_DIFF_MIN, diffMax: BASE_DIFF_MAX, blownChance: BASE_BLOWN, label: '' });
}

/**
 * The execution band that goes with a plan.
 *
 * Reaching costs cleanliness — a rival attempting the biggest thing it has does not also land it as well as
 * a safe one. Derived from the difficulty band rather than declared, for the same reason move danger is
 * derived from move price: two tables describing one decision drift.
 */
export function rivalExecution(plan: RivalPlan): { min: number; max: number } {
  const reach = (plan.diffMax - BASE_DIFF_MAX) * 0.18;
  return { min: Math.max(0, 3.4 - reach), max: Math.max(0.1, 6.8 - reach) };
}
