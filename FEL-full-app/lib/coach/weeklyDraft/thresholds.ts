// lib/coach/weeklyDraft/thresholds.ts — COACH-AI-DRAFT (2026-10-24): every number the rules engine decides with.
//
// ALL NEW, ALL OWNER CALLS. None of these existed before this lane, none is a game-feel number (the feel panel tunes game
// feel; these are coaching rules, like lib/coach/alerts.ts MISSED_ALERT_MIN, which the owner confirmed as a plain
// constant). Each says what it means and why this value; docs/COACH-AI-DRAFT.md lists them for the owner's review.
// Numbers the app already had (STALLED_DAYS, MISSED_ALERT_MIN, OFF_BASELINE_DROP, the effort bands) are imported where
// they are used, never copied.

/** Days of logs a draft reads back. Three weeks: two exposures of a twice-a-week lift, with a missed week's slack. */
export const DRAFT_LOOKBACK_DAYS = 21;

/** Exposures in a row that decide a progression or a regression. Two: one good (or bad) day is a day, two is a trend. */
export const EXPOSURES_TO_DECIDE = 2;

/**
 * The highest logged effort (RPE) at which hitting the top of the rep range still means "ready for more". 8 = two reps
 * left (the Surge band's floor): the athlete owned the weight. Above it they hit the reps by grinding, so the draft holds.
 */
export const PROGRESS_MAX_EFFORT = 8;
/** The same line in reps in reserve, for a set logged with RIR and no effort. */
export const PROGRESS_MIN_RIR = 2;

/** A set logged at this effort (or at 0 reps in reserve) was a limit set. Half the sets there twice running → regress. */
export const LIMIT_EFFORT = 10;

/** Load steps: the smallest plate jump people actually have. */
export const LOAD_STEP = { kg: 2.5, lb: 5 } as const;
/** A regression or an easier week takes this share off a numeric load (rounded down to a load step, at least one step). */
export const REGRESS_LOAD_SHARE = 0.1;

/** Sets ceilings a draft may write. Adults 5, under youth rules 4 (owner decision #6: conservative for minors). */
export const MAX_DRAFT_SETS = { adult: 5, youth: 4 } as const;
/** An easier week never takes a row below this many sets. */
export const MIN_EASE_SETS = 2;

/** The effort a draft may raise an RPE-written load to: adults 9 (10 is the adults-only top set, never drafted). */
export const MAX_DRAFT_RPE = 9;

/**
 * DELOAD when the athlete's logged effort has run high: the mean of their top-set efforts in the lookback is at least
 * this, over at least DELOAD_MIN_EXPOSURES exposures. 8.5 = sitting in Surge (1–2 reps left) as an average, not a peak.
 */
export const DELOAD_MEAN_EFFORT = 8.5;
export const DELOAD_MIN_EXPOSURES = 4;

/** Readiness: low on this many of the last 7 check-in days → an easier week. */
export const READINESS_LOW_DAYS = 3;

/** Mirror form (clean-rep share): down by this many points (of 100) this week against last → ease the squat and lunge work. */
export const FORM_DROP_PTS = 8;
/** Jump: down by this many inches this week against last → less jump volume. Twice profile v2's "same" band (0.5 in). */
export const JUMP_DROP_IN = 1;

/** A logged set this far under the bottom of the range (a share of it) on both exposures → step to the easier version. */
export const SWAP_EASIER_SHARE = 0.5;

/** The coach's note to the athlete, on approval. The thread's own cap is 2000; a note is a line, not a letter. */
export const NOTE_MAX_CHARS = 280;

/** Pain flags read back (days). The attention board reads 60 days of history; the draft looks at the last two weeks. */
export const PAIN_WINDOW_DAYS = 14;
