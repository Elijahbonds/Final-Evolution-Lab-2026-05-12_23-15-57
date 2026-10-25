// lib/coach/readiness/thresholds.ts — COACH-READINESS (2026-10-25): every number the daily jump check decides with.
//
// ALL NEW, ALL OWNER CALLS, each flagged "(new)". None existed before this lane and none is a game-feel number: like
// lib/coach/weeklyDraft/thresholds.ts and lib/coach/alerts.ts MISSED_ALERT_MIN (owner-confirmed as a plain constant),
// these are coaching rules, so they are plain constants, not feel-panel knobs. docs/COACH-READINESS.md lists them.
//
// THE MEASUREMENT'S OWN NUMBERS ARE READ, NEVER COPIED: the smallest real change's z (jump.realChangeZ), the body's
// jump-to-jump CV floor (jump.bioCvPct) and the per-trial typical error all come from lib/jump (JUMP-PRO's register,
// lib/jump/PROPOSED-jump.ts). This file only says how a DAY compares with the athlete's own run of days.

/** (new) Counted jumps a check needs to be read at all. Two: a best and a mean that is not just the best. */
export const MIN_JUMPS = 2;
/** (new) The jumps the check asks for. The brief: "3 countermovement jumps". */
export const JUMPS_ASKED = 3;

/** (new) The stand before the jumps (ms): the floor and the body's size are read here. The Quick Screen asks 3000; a
 *  30-second check asks 2000, which the bench's live takes calibrate on (capture.test.ts). */
export const STAND_MS = 2000;
/** (new) The jumps must come within this long of the stand (ms); then the check reads what it has. */
export const JUMP_PHASE_MS = 20_000;

/** (new) Prior checks a baseline needs before a day can read Low or Ready. Three: one day is a day, three is a level. */
export const BASELINE_MIN_CHECKS = 3;
/** (new) The newest this-many prior checks make the rolling baseline. Ten: about two weeks of training days. */
export const BASELINE_MAX_CHECKS = 10;
/** (new) …and none older than this (days): a baseline from a different training block is not this athlete's normal now. */
export const BASELINE_WINDOW_DAYS = 28;

/**
 * (new) The coach's threshold, as a drop of today's best (and mean) against the baseline, in percent. Bounds on what a
 * coach may set, and the default when they have set nothing. The default flags the brief's "real 8–10 % drop"; the
 * measurement's own smallest real change is ALSO required (rules.ts), so no setting, however low, flags normal noise.
 */
export const DROP_PCT = { min: 3, max: 20, default: 5 } as const;

/** (new) A "How do you feel?" answer at or under this (of 5) is a low feel: it can tip a real-but-small dip to Low. */
export const FEEL_LOW_MAX = 2;

/** (new) Today's check, for Today's session: one saved within this many hours on a day that is plausibly today. */
export const READINESS_TODAY_HOURS = 16;

/** (new) "Twice in a row" means the previous check, if it was within this many days. A gap longer than that is a fresh start. */
export const TWICE_GAP_DAYS = 3;

/** (new) The coach's board keeps an alert this many days (today and yesterday, across time zones). */
export const ALERT_WINDOW_DAYS = 2;

/** (new) The weekly draft's deload trigger: the jump check read Low on at least this many of the last 7 days' checks. */
export const DRAFT_LOW_CHECKS = 2;

/** (new) The history the athlete's trend line shows (checks). */
export const TREND_CHECKS = 28;
