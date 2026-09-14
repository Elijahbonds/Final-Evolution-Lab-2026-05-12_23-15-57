// EVERY OPPONENT EXCEPT ONE PLAYS THE SAME WAY AT 0-0 AND AT MATCH POINT (2026-09-14).
//
// `RivalNerve` was built for the dunk contest and it is the right idea: the rival feels the scoreboard, so
// it goes for one when it is behind on the last dunk and plays it safe when it is comfortable. Audited
// across the game, it has exactly one consumer — DunkMode. Every other opponent in FEL is a constant. The
// tennis AI swings with the same `aiSkill` down 0-5 as up 5-0. The karate rival attacks on the same
// difficulty-scaled cooldown at full health and on its last hit point. A race rival holds its line.
//
// That is the single biggest thing separating the contest from the rest of the roster, and it is not
// content — it is four numbers.
//
// WHY THIS IS A SIBLING OF RivalNerve AND NOT A GENERALISATION OF IT. RivalNerve returns difficulty BANDS
// and a blown-dunk chance: it speaks judged-contest. There is no honest way to ask it what a trailing
// tennis player should do. What generalises is not its output, it is its INVARIANT — so that is what this
// module carries, in a currency (multipliers on an existing Difficulty profile) every mode already has.
//
// THE INVARIANT, VERBATIM FROM RivalNerve BECAUSE IT IS THE WHOLE THING:
//
//   A RIVAL THAT SWINGS BIGGER WHEN TRAILING MUST ALSO MISS MORE.
//
// It is the obvious trap. Make the trailing opponent press harder and nothing else, and falling behind
// becomes strictly better than leading — the AI is rewarded for being beaten, and a player who builds a
// lead is punished for building it. So `aggression` and `mistake` move together, ALWAYS, and there is a
// test that sweeps the whole grid asserting they never come apart.
//
// AND THE SECOND HALF OF IT, WHICH RivalNerve DID NOT NEED AND THIS DOES: `edge` — the honest scalar, a
// shot percentage or a race pace — moves LESS than `mistake`. A pressing opponent may swing bigger and it
// may connect slightly more often, but it must always be paying more in errors than it is gaining in
// quality. Otherwise pressing is just a buff with a story attached.
//
// Pure: no Babylon, no clock, no randomness. The mode rolls; this decides what it is rolling on.

/** Where the opponent stands, from the OPPONENT's point of view. */
export interface Standing {
  /**
   * The opponent's score minus yours, as a fraction of what it takes to win. Negative = it is behind.
   * A margin of −1 means it is being swept; +1 means it is sweeping you.
   */
  margin01: number;
  /** 0 at the first play of the contest, 1 on the last. Nobody panics in the first minute. */
  lateness01: number;
}

/** Multipliers to apply to a Difficulty profile. 1 everywhere means "play your normal game". */
export interface NerveShift {
  /** How hard it presses — initiates rather than waits. */
  aggression: number;
  /** Its unforced-error rate. */
  mistake: number;
  /** The honest scalar (shot percentage, race pace). Always moves less than `mistake`. */
  edge: number;
  /** For a console line or a banner. Null when it is just playing its game. */
  label: string | null;
}

export const NEUTRAL: NerveShift = { aggression: 1, mistake: 1, edge: 1, label: null };

/** Below this margin nothing changes — a one-point game is not a situation. */
export const CALM_MARGIN = 0.12;
/** How far aggression can swing at a hopeless margin, late. */
export const MAX_AGGRESSION_SWING = 0.55;
/** How far the error rate swings. Deliberately larger than the aggression swing: pressing is paid for. */
export const MAX_MISTAKE_SWING = 0.70;
/** And the honest scalar barely moves. This is the ceiling on "pressing made it better". */
export const MAX_EDGE_SWING = 0.12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * What the scoreboard does to this opponent.
 *
 * `lateness01` scales everything, so the same margin means nothing on the first play and everything on the
 * last — which is what makes a comeback feel like one rather than like a difficulty setting.
 */
export function nerve(s: Standing): NerveShift {
  const margin = clamp(Number.isFinite(s.margin01) ? s.margin01 : 0, -1, 1);
  const late = clamp(Number.isFinite(s.lateness01) ? s.lateness01 : 0, 0, 1);

  // dead band: a close game is not a situation, and an opponent that reacts to a one-point swing reads as
  // twitchy rather than as under pressure.
  if (Math.abs(margin) < CALM_MARGIN) return NEUTRAL;

  // `urgency` is the pressure it is actually under: how far out of a close game it is, times how little
  // time is left to do anything about it. Early, even a blowout leaves room to play normally.
  const over = (Math.abs(margin) - CALM_MARGIN) / (1 - CALM_MARGIN);
  const urgency = over * (0.35 + 0.65 * late);      // never quite zero late-ness: a rout is a rout

  const behind = margin < 0;
  const dir = behind ? 1 : -1;                       // behind presses; ahead protects

  return {
    aggression: 1 + dir * MAX_AGGRESSION_SWING * urgency,
    mistake: 1 + dir * MAX_MISTAKE_SWING * urgency,
    edge: 1 + dir * MAX_EDGE_SWING * urgency,
    label: urgency < 0.25 ? null : behind ? 'PRESSING' : 'PROTECTING THE LEAD',
  };
}

/**
 * Apply a shift to a raw 0..1 skill scalar — for the modes whose opponent IS one number.
 *
 * Clamped away from both ends: a 0 opponent stops playing and a 1 opponent cannot be beaten, and neither
 * is a comeback story.
 */
export const SKILL_FLOOR = 0.15;
export const SKILL_CEIL = 0.97;

export function nervedSkill(skill: number, shift: NerveShift): number {
  if (!Number.isFinite(skill)) return skill;
  return clamp(skill * shift.edge, SKILL_FLOOR, SKILL_CEIL);
}

/**
 * The standing, derived from two scores and how far through the contest you are.
 *
 * `target` is what it takes to win — games in a match, points in a set, rounds in a fight. Normalising
 * against it is what lets one module serve a race to 25 and a fight to 2.
 */
export function standingOf(theirScore: number, yourScore: number, target: number, lateness01: number): Standing {
  const t = Math.max(1, target);
  return { margin01: clamp((theirScore - yourScore) / t, -1, 1), lateness01 };
}
