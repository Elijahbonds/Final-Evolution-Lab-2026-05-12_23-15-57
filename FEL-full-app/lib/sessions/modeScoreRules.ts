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
 * OWNER DECISION (2026-09-28, after land): a result in a mode with no row is RECORDED unpaid (NO_RULES) rather than
 * refused, so the Arena submit, the carnival relay and a friend's challenge still run on it (app/api/sessions/route.ts).
 *
 * DERIVED ROWS (OWNER DECISION 2026-09-28, the same day). Seven modes are capped by a per-run bound DERIVED from their own
 * code instead of by measured runs: the endless / combo-driven four, where one ordinary run × 4 would refuse strong honest
 * play (skateboarding, surfing, karateEndless, music), and four modes the owner ruled should pay (storyMode's boss and
 * rail, acting, irl, dunkduel). DERIVED_BOUNDS carries each bound with its basis; derivedRule() turns it into a row.
 * KNOWN, OWNER-ACCEPTED RISK (2026-09-28, "fast-follow, not a blocker"): skateboarding and surfing take the Arena's ×2
 * stake models (435,544,000 / 5,866,322) and are NOT endless (lib/session-payout.ts ENDLESS_MODES), so for those two the
 * row is also the only payout cap: XP = 1.5 × score up to ~653M a run. karateEndless and music are held by the endless
 * ceiling. (Review 2026-09-29: four maximal skate runs overflow the int4 PlayerProfile.xp, after which that player's
 * paying sessions 500; forged rows also feed the Arena's cold-start house median, lib/arena-ghost.ts.) Re-asked on
 * 2026-09-29 with those knock-ons in front of him, the owner kept it: ship as is, a payout-grade bound is the fast-follow.
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
import { DUNK_ATTEMPT_MAX, MIRRORED, SCORE_CEILINGS, UNTIMED_RUN_SEC, killSwitchOn, scoreCeilingFor } from '@/lib/arena-score-integrity';
import { ENDLESS_MODES, isCatalogueMode } from '@/lib/session-payout';
import { MAX_FLIGHT, heightFromFlight } from '@/lib/babylon/core/IRLCore';

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
  /**
   * 'rules' = the mode's exact maximum (arena-score-integrity); 'measured' = the best measured score × SCORE_HEADROOM;
   * 'derived' = a per-run bound worked out from the mode's own code (DERIVED_BOUNDS, `basis` says how).
   */
  maxScoreFrom: 'rules' | 'measured' | 'derived';
  measured: readonly MeasuredRun[];
  /** 'derived' rows: where the bound comes from. */
  basis?: string;
  /**
   * OWNER DECISION (2026-09-28): the run pays only the PLAYED FLOOR — as a score of 0 and no win (10 XP, 1 profile shard,
   * the streak day) — whatever its validated score, which is still recorded (history) along with any form read (the
   * camera power estimate). No wallet coins, no won shards, no season XP, no mastery sample. Prove It (dunkduel).
   */
  payFloorOnly?: boolean;
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
  // ECONOMY-CAPS (a): measured TRUE :3000 runs from eye-a1a1c5f9/MEASURED_RUNS.md
  tiebreak: [{ score: 1020, sec: 29.8, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md tiebreak 1020/29.8 s' }],
  training: [{ score: 4200, sec: 61.7, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md training 4200/61.7 s' }],
  tennis: [{ score: 4, sec: 90.6, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md tennis 4/90.6 s' }],
  golf: [{ score: 670, sec: 75.0, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md golf 670/75.0 s' }],
  karateVersus: [{ score: 200, sec: 29.2, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md karateVersus 200/29.2 s' }],
  karateEndless: [{ score: 20_520, sec: 127.3, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md karateEndless 20520/127.3 s' }],
  volleyball: [{ score: 25, sec: 287.9, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md volleyball 25/287.9 s' }],
  aeroAces: [{ score: 1100, sec: 155.1, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md aeroAces 1100/155.1 s' }],
  skateboarding: [{ score: 1649, sec: 93.9, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md skateboarding 1649/93.9 s' }],
  surfing: [{ score: 4451, sec: 94.4, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md surfing 4451/94.4 s' }],
  carnival: [{ score: 1216, sec: 98.7, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md carnival 1216/98.7 s' }],
  music: [{ score: 170_300, sec: 89.3, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md music 170300/89.3 s (32 bars Arena set)' }],
  velocityKart: [{ score: 1345, sec: 123.1, secIs: 'posted', source: 'eye-a1a1c5f9/MEASURED_RUNS.md velocityKart 1345/123.1 s' }],
};

/** The Postgres int4 ceiling of GameSession.score / SessionRun.score: no row can store more, so no rule allows more. */
export const SCORE_COLUMN_MAX = 2_147_483_647;

// ── The derived per-run bounds (OWNER DECISION 2026-09-28) ─────────────────────────────────────────────────────────────
// Three games keep their scoring constants inline in their components; they are mirrored here and modeScoreRules.test.ts
// reads the component source and fails the day one drifts (the arena-score-integrity MIRRORED pattern).
export const STORY_MIRRORED = {
  // components/games/glitch-boss-game.tsx: boss bHp 100, player hp 100, the biggest hit hitBoss(15), score += dmg × 5, a
  // win adds round(hp × 3)
  bossHp: 100, bossPlayerHp: 100, bossMaxHit: 15, bossPtsPerDmg: 5, bossWinHpMult: 3,
  // components/games/rail-grind-game.tsx: TARGET_DIST 3000 at speed (400 + dist × 0.02) × speedMult (the lowest grade's
  // 0.9, lib/prq.ts), an orb every 0.6 s at least (≤ 50 each), a landing after > 0.3 s airborne worth
  // round(20 × (1 + combo × 0.1)), a finish adds round(hp × 2) of hp 100
  railTargetDist: 3000, railBaseSpeed: 400, railMinSpeedMult: 0.9, railOrbEverySec: 0.6, railOrbMaxPts: 50,
  railMinAirSec: 0.3, railLandBase: 20, railLandComboStep: 0.1, railFinishHpMult: 2, railPlayerHp: 100,
  // components/games/acting-game.tsx: score = round(average × 100), average = clamp01(…) (lib/babylon/core/ActingCore.ts)
  actingMax: 100,
  // lib/babylon/modes/DunkDuelMode.ts: DUNKS_EACH 2, each judged at most DUNK_ATTEMPT_MAX (arena-score-integrity)
  dunkDuelDunksEach: 2,
} as const;

/** The boss fight: all of the boss's HP plus two maximal hits of overkill (a keyboard and a pad press in one frame), and the full win bonus. */
export function storyBossBound(m = STORY_MIRRORED): number {
  return (m.bossHp + 2 * m.bossMaxHit) * m.bossPtsPerDmg + Math.round(m.bossPlayerHp * m.bossWinHpMult);
}

/** The rail: at the slowest the run lasts TARGET / (400 × 0.9) s of game time; every orb, every possible landing, the full finish. */
export function storyRailBound(m = STORY_MIRRORED): number {
  const sec = m.railTargetDist / (m.railBaseSpeed * m.railMinSpeedMult);
  const orbs = (Math.floor(sec / m.railOrbEverySec) + 1) * m.railOrbMaxPts;
  const landings = Math.floor(sec / m.railMinAirSec);
  let land = 0;
  for (let k = 1; k <= landings; k++) land += Math.round(m.railLandBase * (1 + k * m.railLandComboStep));
  return orbs + land + Math.round(m.railPlayerHp * m.railFinishHpMult);
}

export interface DerivedBound {
  maxScore: number;
  /** The run length the bound was worked out over, when it has one (a pace of maxScore over it). */
  runSec: number | null;
  basis: string;
  payFloorOnly?: boolean;
}

/** A 'bound' row of SCORE_CEILINGS, or the column's own limit where the kill switch serves a fallback game on another scale. */
function modelledBound(key: 'skateboarding' | 'surfing' | 'karateEndless', killSwitch: boolean): number {
  const c = SCORE_CEILINGS[key];
  return killSwitch && c.swapsUnderKillSwitch ? SCORE_COLUMN_MAX : Math.min(SCORE_COLUMN_MAX, c.max);
}

export function derivedBounds(o: { killSwitch?: boolean } = {}): Readonly<Record<string, DerivedBound>> {
  const ks = o.killSwitch ?? killSwitchOn();
  return {
    // skateboarding and surfing now have MEASURED_RUNS rows (ECONOMY-CAPS a); finite pay cap still limits payout
    karateEndless: { maxScore: modelledBound('karateEndless', ks), runSec: UNTIMED_RUN_SEC, basis: 'arena-score-integrity karateEndlessBound(): a 30-minute run swinging at the cooldown, × BOUND_MARGIN (payout also held by the endless ceiling)' },
    // music: the per-SET bound is the one that already exists — sessionScoreCap (lib/session-payout.ts): a set's score may
    // not exceed what its own hits allow (performSetMax), checked in the route as above_run_cap. This row adds only the
    // column's limit, and the endless payout ceiling holds what it pays.
    music: { maxScore: SCORE_COLUMN_MAX, runSec: null, basis: 'the per-set bound by its own hits (session-payout sessionScoreCap → above_run_cap), and the score column\'s limit' },
    storyMode: { maxScore: Math.max(storyBossBound(), storyRailBound()), runSec: null, basis: `max of the boss fight (${storyBossBound()}) and the rail (${storyRailBound()}) from their own constants (STORY_MIRRORED)` },
    acting: { maxScore: STORY_MIRRORED.actingMax, runSec: null, basis: 'acting-game: round(average × 100), average clamp01 (ActingCore)' },
    irl: { maxScore: Math.round(heightFromFlight(MAX_FLIGHT) * 100), runSec: null, basis: 'irl-game: best jump in cm; IRLCore refuses a flight over MAX_FLIGHT, so heightFromFlight(MAX_FLIGHT) is the highest' },
    dunkduel: { maxScore: STORY_MIRRORED.dunkDuelDunksEach * DUNK_ATTEMPT_MAX, runSec: null, basis: 'DunkDuelMode: DUNKS_EACH × DUNK_ATTEMPT_MAX; paid the played floor only (owner)', payFloorOnly: true },
  };
}

/** A derived bound as a rule: the bound, a pace of the bound over its modelled run (else over the shortest run), the floors. */
export function derivedRule(b: DerivedBound): ModeScoreRule {
  return {
    maxScore: b.maxScore,
    maxScorePerSecond: Math.ceil((b.maxScore / (b.runSec ?? MIN_DURATION_FLOOR_MS / 1000)) * 100) / 100,
    minDurationMs: MIN_DURATION_FLOOR_MS,
    maxDurationMs: MAX_DURATION_FLOOR_MS,
    enabled: true,
    maxScoreFrom: 'derived',
    measured: [],
    basis: b.basis,
    ...(b.payFloorOnly ? { payFloorOnly: true } : {}),
  };
}

export const MODE_SCORE_RULES: Readonly<Record<string, ModeScoreRule>> = {
  ...Object.fromEntries(
    Object.entries(MEASURED_RUNS)
      .map(([mode, runs]) => [mode, deriveRule(mode, runs)] as const)
      .filter((e): e is readonly [string, ModeScoreRule] => e[1] !== null),
  ),
  ...Object.fromEntries(Object.entries(derivedBounds()).map(([mode, b]) => [mode, derivedRule(b)])),
};

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
 * The checks a result in a mode with NO row still gets before it is recorded unpaid (OWNER DECISION: NO_RULES): a
 * whole number, not negative, and storable. Nothing is paid for it, so there is no ceiling beyond the column's.
 */
export function checkUnruledScore(score: unknown): { ok: true; score: number } | { ok: false; reason: 'SCORE_INVALID'; detail: ScoreInvalidDetail; limit: number | null } {
  if (typeof score !== 'number' || !Number.isFinite(score) || !Number.isInteger(score)) return { ok: false, reason: 'SCORE_INVALID', detail: 'score_not_integer', limit: null };
  if (score < 0) return { ok: false, reason: 'SCORE_INVALID', detail: 'score_negative', limit: 0 };
  if (score > SCORE_COLUMN_MAX) return { ok: false, reason: 'SCORE_INVALID', detail: 'above_max_score', limit: SCORE_COLUMN_MAX };
  return { ok: true, score };
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
