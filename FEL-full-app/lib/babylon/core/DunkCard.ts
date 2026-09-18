// DunkCard — what you tried, how you finished it, how it read (dunk 10-phase pass P3, 2026-09-16).
//
// THE PROBLEM THIS SOLVES, MEASURED. On rc22 every attempt in the lab came back `DIFF 10.0` — the cap — whatever the
// player did: a WINDMILL (2.4) and a BETWEEN THE LEGS (3.8) scored the same, because the STYLE TIER alone (power 3,
// flashy 5.5, SIGNATURE 8) plus `charge * 2 + launchSpeed01` saturated the difficulty term before the vocabulary was
// consulted. Ten named dunks, one number. And execution moved the card by five points out of fifty, so the only thing
// the flight actually asks of a player barely registered.
//
// The three numbers now mean what their names say:
//
//   DIFFICULTY — WHAT YOU TRIED. The air trick is the biggest single term (its own difficulty, ×1.5), then what you
//                stacked on it: a runway trick, a prop cleared, a lob caught. The run-up is a QUALIFIER worth about a
//                point, not a score: attacking the rim at speed is table stakes in a dunk contest, not an achievement.
//   EXECUTION  — HOW YOU FINISHED IT. The slam curve, untouched here (DunkSystem.slamExecution).
//   STYLE      — HOW IT READ. The tier you called (POWER / FLASHY / SIGNATURE) lives here, where it belongs: calling
//                your signature says how the dunk should LOOK, and it pays when the room and the finish agree with it.
//
// Pure, so the balance can be argued in a test rather than in a playthrough.

/** Everything the panel is told about one attempt. */
export interface DunkAttemptFacts {
  /** The air tricks' own difficulty, combo multiplier included (the flight's, with the style tier removed). */
  trickDifficulty: number;
  /** A runway trick thrown under the hold-run (self-lob, kick-up, cartwheel, double-up…). */
  runwayDifficulty: number;
  /** A prop cleared or a lob caught. */
  propBonus: number;
  /** 0..1 each: how loaded the jump was, how fast the runway attack was. */
  charge: number;
  launchSpeed01: number;
  /** The tier called on the runway: POWER 3 · FLASHY 5.5 · SIGNATURE 8. */
  styleTier: number;
  /** Showboat taps on the runway. */
  styleTaps: number;
  /** The room, 0..100. */
  hype: number;
  /** Held the iron through the flush. */
  hang: boolean;
  /** The judges have seen this dunk already this night. */
  repeat: boolean;
  /** 0..1 from the slam curve. */
  execution01: number;
  /** Air tricks BEYOND the first in this flight. A chain is worth something even when difficulty has saturated. */
  chainTricks?: number;
}

export interface DunkCardScores { difficulty: number; execution: number; style: number }

/** The run-up's whole contribution to DIFFICULTY. A full-speed, fully-loaded attack is worth about one point. */
export const APPROACH_MAX = 1.0;
/** The air trick's weight. The vocabulary is the difficulty: this is what makes a BETWEEN THE LEGS harder than a WINDMILL. */
export const TRICK_WEIGHT = 1.35;
/** Under this execution the ball does not go in — see `slamIsClean`. */
export const RIM_CLEAN = 0.3;

const clamp10 = (v: number) => Math.max(0, Math.min(10, v));

export function dunkCard(f: DunkAttemptFacts): DunkCardScores {
  const varietyMod = f.repeat ? 0.8 : 1;
  const varietyBonus = f.repeat ? 0 : 0.5;
  const approach = Math.min(APPROACH_MAX, f.charge * 0.7 + f.launchSpeed01 * 0.5);
  const difficulty = clamp10((f.trickDifficulty * TRICK_WEIGHT + f.runwayDifficulty + f.propBonus + approach) * varietyMod + varietyBonus);
  const execution = clamp10(f.execution01 * 10);
  // A CHAIN PAYS STYLE TOO (P5, 2026-09-16). COMBO_CHAIN_BONUS multiplies difficulty, and a real combo — a full run-up,
  // two named dunks, a lob caught on the way — saturates difficulty at 10 before the multiplier is applied, so the
  // second trick's marginal value was zero: measured in the lab, WINDMILL → 360 read DIFF 10.0, exactly as the single
  // windmill over a prop did. Two tricks in one flight is how a dunk LOOKS as much as how hard it is, so the chain
  // also lands where nothing else has saturated.
  const chain = Math.max(0, f.chainTricks ?? 0);
  const style = clamp10(f.styleTier * 0.85 + Math.min(2, f.hype / 50) + f.styleTaps * 0.8 + (f.hang ? 1 : 0) + Math.min(2.4, chain * 1.2));
  return { difficulty, execution, style };
}

/**
 * Does the ball go in?
 *
 * The flight INVITES a press from the top of the arc and takes every press from there (the buffer). That is right — a
 * fourteen-frame window is not a reaction test — but it left the rim with nothing to say: a press at the very instant
 * the read lifted flushed exactly like a perfect one, and the only miss in the mode was never pressing at all. So the
 * card was carrying the whole difference between a great dunk and a flinch, and the card compresses.
 *
 * A jam thrown at the iron before you have got there hits iron. Only the earliest sliver of the accepted range clanks
 * (execution under RIM_CLEAN is roughly the first tenth of the buffer), so this punishes answering the read with your
 * eyes shut and nothing else.
 */
export function slamIsClean(execution01: number): boolean {
  return execution01 >= RIM_CLEAN;
}
