/**
 * lib/sessions/modeScoreRules.ts — ECONOMY-SESSIONS-HARDEN (2026-09-28): what one run of each mode may believably be,
 * checked by the server before a run pays anything. PURE: no DB, no network, no Babylon.
 *
 * WHY. POST /api/sessions took the client's score and duration and paid from them (XP = 1.5 × score, profile shards =
 * score / 20, season XP, mastery, and the shell's wallet coins from the same score). Only some modes had a bound, and
 * it CLAMPED: a forged score was paid as the most the mode allows (lib/session-payout.ts sessionScoreCap). A run that
 * fails any rule here is now REJECTED — nothing paid, logged as SCORE_INVALID with the rule it broke — never clamped.
 *
 * THE RULES (one row per session key, the key GameShell posts; canonicalModeKey maps the old spellings):
 *   maxScore           the hard ceiling for one run
 *   maxScorePerSecond  score ÷ the SERVER's duration (now − the run's startedAt) may not exceed this
 *   minDurationMs      the shortest believable run, by the server's clock
 *   maxDurationMs      the longest believable run, by the server's clock (the run also expires at this + RUN_GRACE_MS)
 *   enabled            false = the mode takes no paying runs (a result is SCORE_INVALID mode_disabled)
 *
 * A MODE WITH NO ROW PAYS NOTHING (fail closed). Adding a mode means adding its row, from measured runs.
 *
 * WHERE THE NUMBERS COME FROM (the tip's rule: real measured TRUE :3000 runs with headroom, not guesses). MEASURED_RUNS
 * lists, per session key, every completed run the TRUE :3000 stamp recorded in ~/Claude/outbox (the eye, Features UX and
 * Arena playtest captures), each with its score, its length and the file it came from. Every rule is then derived from
 * those runs by deriveRule() — the same arithmetic for every mode, so no row can carry a hand-tuned number:
 *
 *   maxScore           a mode whose own rules give an exact maximum (lib/arena-score-integrity.ts SCORE_CEILINGS kind
 *                      'rules': first to 11, five racks of five, four dunks of 60…) is capped at exactly that — no honest
 *                      run exceeds it, and a thin sample × headroom could fall below a perfect run (threePoint: measured 6,
 *                      perfect 30). Every other mode: the best measured score × SCORE_HEADROOM. (The 'bound' kind rows are
 *                      stake models with a ×2 margin — snowboarding 322,630,500 — and are no payout cap.)
 *   maxScorePerSecond  where a run's length was measured: the fastest measured pace × RATE_HEADROOM, and never below a
 *                      maxScore run at the shortest measured length. Where no length was measured, only the floor applies
 *                      (maxScore over MIN_DURATION_FLOOR_MS).
 *   minDurationMs      the shortest measured length ÷ MIN_DURATION_DIVISOR, at least MIN_DURATION_FLOOR_MS
 *   maxDurationMs      the longest measured length × DURATION_HEADROOM, at least MAX_DURATION_FLOOR_MS
 *
 * A mode with no completed TRUE :3000 run has no row, and a non-'rules' mode whose runs carry no readable score has none
 * either: it pays nothing until one is measured (the land report lists them). A run's length is `posted` (the duration
 * the session POST carried), `play` (the probe's own play window or the mode's clock), or `upper` (only a bound: the
 * probe's per-mode budget or a request window) — an upper bound is never used as a SHORTEST length or a pace.
 *
 * THE SERVER'S DURATION IS LONGER THAN THE PLAYED TIME. The shell starts the run when the game mounts, so the server's
 * clock also counts loading, the READY card and the countdown. That only makes the pace and minimum checks more lenient
 * than the played time would; the maximum is floored at MAX_DURATION_FLOOR_MS so a player who leaves the READY card up
 * for a while is not refused.
 */

import { canonicalModeKey } from '@/lib/game-data';
import { killSwitchOn, scoreCeilingFor } from '@/lib/arena-score-integrity';
import { ENDLESS_MODES, isCatalogueMode } from '@/lib/session-payout';

/** An open run expires this long after its maxDurationMs (a finish after that is RUN_EXPIRED). */
export const RUN_GRACE_MS = 5 * 60_000;

/**
 * Headroom over the measured runs. They are QA's and the eye's, not a strong player's. The pace gets more: the fastest
 * real run seen on any port (FreeRun, 2,767 in 21 s on a dev lane) is 5.2× the :3000 run's pace, and RATE_HEADROOM is the
 * smallest whole multiple that keeps it in (modeScoreRules.test.ts, the cross-check).
 */
export const SCORE_HEADROOM = 4;
export const RATE_HEADROOM = 6;
export const DURATION_HEADROOM = 4;
export const MIN_DURATION_DIVISOR = 4;
export const MIN_DURATION_FLOOR_MS = 2_000;
export const MAX_DURATION_FLOOR_MS = 45 * 60_000;

/** One completed run the TRUE :3000 stamp recorded. */
export interface MeasuredRun {
  /** The score it posted, or null where the capture does not say it plainly. */
  score: number | null;
  /** Its length in seconds, and what that length is (see the header): posted / play are lengths, upper is only a bound. */
  sec: number | null;
  secIs: 'posted' | 'play' | 'upper' | 'unknown';
  /** '<file under ~/Claude/outbox>[:line or JSON path]'. */
  source: string;
}

export interface ModeScoreRule {
  maxScore: number;
  maxScorePerSecond: number;
  minDurationMs: number;
  maxDurationMs: number;
  enabled: boolean;
  /** 'rules' = the mode's exact maximum (arena-score-integrity); 'measured' = the best measured score × SCORE_HEADROOM. */
  maxScoreFrom: 'rules' | 'measured';
  measured: readonly MeasuredRun[];
}

/**
 * The mode's own exact maximum (SCORE_CEILINGS kind 'rules', keyed by session key), or null. Not for an endless mode
 * (music free play runs past the Arena set its row bounds), and not where the kill switch mounts a fallback game on
 * another scale — the same exceptions lib/session-payout.ts sessionScoreCap makes.
 */
export function rulesMaxFor(mode: string, o: { killSwitch?: boolean } = {}): number | null {
  const k = canonicalModeKey(mode);
  if (Object.prototype.hasOwnProperty.call(ENDLESS_MODES, k)) return null;
  const c = scoreCeilingFor(k);
  if (!c || c.kind !== 'rules') return null;
  if ((o.killSwitch ?? killSwitchOn()) && c.swapsUnderKillSwitch) return null;
  return c.max;
}

/** The one derivation every row goes through (see the header). null = the runs cannot support a rule (no row). */
export function deriveRule(mode: string, runs: readonly MeasuredRun[], o: { enabled?: boolean; killSwitch?: boolean } = {}): ModeScoreRule | null {
  if (!runs.length) return null;
  const scores = runs.map((r) => r.score).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const own = rulesMaxFor(mode, { killSwitch: o.killSwitch });
  if (own === null && !scores.length) return null;
  const maxScore = own ?? Math.ceil(Math.max(...scores) * SCORE_HEADROOM);
  const lengths = runs.filter((r) => (r.secIs === 'posted' || r.secIs === 'play') && typeof r.sec === 'number' && r.sec > 0);
  const paced = lengths.filter((r) => typeof r.score === 'number');
  const minSec = lengths.length ? Math.min(...lengths.map((r) => r.sec as number)) : null;
  const allSec = runs.map((r) => r.sec).filter((v): v is number => typeof v === 'number' && v > 0);
  const maxSec = allSec.length ? Math.max(...allSec) : null;
  const peak = paced.length ? Math.max(...paced.map((r) => (r.score as number) / (r.sec as number))) : null;
  const minDurationMs = minSec === null ? MIN_DURATION_FLOOR_MS : Math.max(MIN_DURATION_FLOOR_MS, Math.floor((minSec * 1000) / MIN_DURATION_DIVISOR));
  const rate = minSec === null || peak === null
    ? maxScore / (MIN_DURATION_FLOOR_MS / 1000)
    : Math.max(peak * RATE_HEADROOM, maxScore / minSec);
  return {
    maxScore,
    maxScorePerSecond: Math.ceil(rate * 100) / 100,
    minDurationMs,
    maxDurationMs: Math.max(MAX_DURATION_FLOOR_MS, maxSec === null ? 0 : Math.ceil(maxSec * 1000 * DURATION_HEADROOM)),
    enabled: o.enabled ?? true,
    maxScoreFrom: own === null ? 'measured' : 'rules',
    measured: runs,
  };
}

const AP = 'ARENA-PLAYTEST-d3d4a93.md';   // the logged-in Arena playtest on localhost:3000 (its line 5), one ~60 s budget a mode

/**
 * Every completed, scored TRUE :3000 run in ~/Claude/outbox, by session key (collected 2026-09-28; the land report has the
 * sweep). Runs on any other port — the rc gauntlet on :3096, the dev lanes — are not here: they are the cross-check in
 * modeScoreRules.test.ts (no real run seen anywhere may be refused), never a source.
 */
export const MEASURED_RUNS: Readonly<Record<string, readonly MeasuredRun[]>> = {
  brainBrawl: [
    { score: 549, sec: 43, secIs: 'posted', source: 'eye-0e5dad00/bb/summary.json $.N10_endCard.served[0]' },
    { score: 196, sec: null, secIs: 'unknown', source: 'features-tip-eye-0e5dad00-ux/FINAL.json:14' },
    { score: 654, sec: 31, secIs: 'play', source: 'brainbrawl-eye-252548b/B/B91-after-end.txt:1 (rows t 10.07 → 41.42)' },
    { score: 551, sec: 40, secIs: 'play', source: 'brainbrawl-eye-b3d498e/P/91-endcard.txt:1 (rows t 2.92 → 43.34)' },
    { score: 98, sec: 62, secIs: 'upper', source: 'features-brainbrawl-252548b-ux/VERDICT.md:6' },
    { score: 295, sec: 33, secIs: 'upper', source: 'features-brainbrawl-b3d498e-ux/VERDICT.md:6' },
  ],
  snowboarding: [
    { score: 2156, sec: 72, secIs: 'posted', source: 'eye-46a8dc6a/run/summary.json $.served[1]' },
  ],
  dunkContest: [
    { score: 128, sec: 60, secIs: 'upper', source: `${AP}:39` },
    { score: 136, sec: null, secIs: 'unknown', source: 'arena-resmoke-0c6c142/dunk-arena-qm.txt:1' },
  ],
  threePoint: [
    { score: 6, sec: 150, secIs: 'upper', source: `${AP}:44 (ARENA-10PHASE.md:11: a full 3PT run is ~150 s under the fake pad)` },
    { score: 4, sec: null, secIs: 'unknown', source: 'arena-resmoke-0c6c142/threepoint-arena-qm.txt:1' },
  ],
  hoops1v1: [{ score: 11, sec: 60, secIs: 'upper', source: `${AP}:114` }],
  football: [{ score: 395, sec: 60, secIs: 'upper', source: `${AP}:127` }],
  freerun: [{ score: 695, sec: 27.2, secIs: 'play', source: `${AP}:128 (finish 27.2 s, grade C)` }],
  dance: [{ score: 1650, sec: 60, secIs: 'upper', source: `${AP}:129` }],
  bigAir: [{ score: 319, sec: 60, secIs: 'upper', source: `${AP}:130` }],
  soccer: [{ score: null, sec: 60, secIs: 'upper', source: `${AP}:131 (kick 3/5, "6–2 you": the posted score is not in the capture)` }],
  whoSceneIt: [{ score: 479, sec: 60, secIs: 'upper', source: `${AP}:102` }],
  baseball: [{ score: 0, sec: 60, secIs: 'upper', source: `${AP}:105` }],
};

export const MODE_SCORE_RULES: Readonly<Record<string, ModeScoreRule>> = Object.fromEntries(
  Object.entries(MEASURED_RUNS)
    .map(([mode, runs]) => [mode, deriveRule(mode, runs)] as const)
    .filter((e): e is readonly [string, ModeScoreRule] => e[1] !== null),
);

/** The modes that currently take no paying run because nothing was measured for them (listed in the land report). */
export function unmeasuredModes(sessionKeys: readonly string[]): string[] {
  return sessionKeys.filter((k) => !Object.prototype.hasOwnProperty.call(MODE_SCORE_RULES, canonicalModeKey(k)));
}

export type ScoreInvalidDetail =
  | 'unknown_mode' | 'no_rules' | 'mode_disabled' | 'score_not_integer' | 'score_negative' | 'above_max_score'
  | 'above_max_rate' | 'too_short' | 'too_long';

export type RunCheck =
  | { ok: true; mode: string; score: number; rule: ModeScoreRule }
  | { ok: false; reason: 'SCORE_INVALID'; detail: ScoreInvalidDetail; mode: string; limit: number | null };

/** The rule for a session key (after canonicalModeKey), or null. */
export function ruleFor(mode: string, rules: Readonly<Record<string, ModeScoreRule>> = MODE_SCORE_RULES): ModeScoreRule | null {
  const k = canonicalModeKey(mode);
  return Object.prototype.hasOwnProperty.call(rules, k) ? rules[k] : null;
}

/**
 * Is this run's result believable? `score` is the client's raw value (checked as given — never floored, rounded or
 * clamped here); `durationMs` is the SERVER's (now − startedAt).
 */
export function checkRunScore(
  o: { mode: string; score: unknown; durationMs: number },
  rules: Readonly<Record<string, ModeScoreRule>> = MODE_SCORE_RULES,
): RunCheck {
  const mode = canonicalModeKey(o.mode);
  const bad = (detail: ScoreInvalidDetail, limit: number | null = null): RunCheck => ({ ok: false, reason: 'SCORE_INVALID', detail, mode, limit });
  const rule = ruleFor(mode, rules);
  // a key the catalogue does not know, or a catalogue mode with no measured row yet: fail closed either way
  if (!rule) return bad(isCatalogueMode(mode) ? 'no_rules' : 'unknown_mode');
  if (!rule.enabled) return bad('mode_disabled');
  const s = o.score;
  if (typeof s !== 'number' || !Number.isFinite(s) || !Number.isInteger(s)) return bad('score_not_integer');
  if (s < 0) return bad('score_negative', 0);
  if (s > rule.maxScore) return bad('above_max_score', rule.maxScore);
  const d = Number.isFinite(o.durationMs) ? o.durationMs : 0;
  if (d < rule.minDurationMs) return bad('too_short', rule.minDurationMs);
  if (d > rule.maxDurationMs) return bad('too_long', rule.maxDurationMs);
  if (s / (d / 1000) > rule.maxScorePerSecond) return bad('above_max_rate', rule.maxScorePerSecond);
  return { ok: true, mode, score: s, rule };
}
