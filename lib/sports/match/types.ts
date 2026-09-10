/**
 * lib/sports/match/types.ts
 * =========================
 * The shared vocabulary for the precision modes' match structure.
 *
 * WHY THIS EXISTS. The precision family (tennis, golf, baseball, soccer,
 * football) all shipped a proven *core* — swing timing, ball flight, contact
 * resolution, carrier geometry — wrapped in a burst loop: play N rounds,
 * accumulate arcade points, end. VISION_AUDIT.md flags all five the same way,
 * "full match integration pending", and calls the integration pass the #1 move
 * against the vision. A burst is not a match: nothing carries between rounds,
 * nothing can be lost, and the session ends on a counter rather than on the
 * sport's own terms.
 *
 * This layer supplies the missing structure and nothing else. It is pure and
 * headless: it owns competition state (points, games, sets, strokes, holes,
 * outs, innings, downs, drives), decides when a contest is over, and produces
 * one uniform read for the HUD and the session result. It never touches
 * Babylon, physics, timing windows or input — those already work, and this
 * deliberately does not second-guess them.
 *
 * Every engine here is deterministic: same inputs, same state, no RNG, no
 * clock reads. That is what lets scripts/match-structure-tests.ts drive whole
 * matches to completion and assert on the real rules.
 */

/**
 * The uniform read every match engine produces. Modes render `line`/`detail`
 * on the HUD and hand `summary` to `ctx.end`, so a session result reports the
 * sport's own score ("6-4 3-6 7-6", "-2 THRU 9") rather than a points total.
 */
export interface MatchProgress {
  /** Primary scoreboard line, e.g. "40-30" or "THRU 7 · -2". */
  line: string;
  /** Secondary context, e.g. "Set 2 · 4-3" or "Hole 8 · Par 4". */
  detail: string;
  /** True once the contest is decided by its own rules. */
  complete: boolean;
  /**
   * 0 = the player, 1 = the opponent, null = undecided or not head-to-head
   * (a golf round against par has no opponent side).
   */
  winner: 0 | 1 | null;
  /** Final line for the session result, e.g. "6-4 7-5" or "68 (-4)". */
  summary: string;
  /**
   * Session score for the progression pipeline. Modes pass this to `ctx.end`,
   * so PRQ, mastery and the wallet all read one number with a stable meaning
   * per mode rather than an arcade tally that drifts with tuning.
   */
  score: number;
}

/** A contest with two sides. 0 is always the player. */
export type Side = 0 | 1;

export const other = (s: Side): Side => (1 - s) as Side;

/**
 * Common shape for the engines. Each `apply*` call returns the progress read
 * after the event, so a mode never has to reach into engine internals to
 * update its HUD.
 */
export interface MatchEngine {
  /** Current read without advancing anything. */
  progress(): MatchProgress;
  /** Has the contest finished under its own rules? */
  readonly complete: boolean;
}
