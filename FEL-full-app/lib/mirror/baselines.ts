// baselines — personal baselines per athlete, per pattern, per check (MIRROR-COACH P4, 2026-09-29).
//
// WHY. Every Mirror pattern so far (squat, lunge) grades against ONE fixed threshold table, the same number for a
// 19-year-old college athlete and a 55-year-old coming back from a lay-off. That is the right FIRST read (it is
// what "builds capacity" without diagnosing anyone), but it cannot answer the question a returning athlete
// actually asks: "am I getting better?" This module answers that from the athlete's OWN history, never the
// group's — the median of the first three readable sessions of a pattern becomes that athlete's baseline for
// every check that pattern reads, and every later session compares against IT, alongside (never instead of) the
// fixed threshold. See DECISIONS.md #9 / PLAN.md phase 4 ("personal baselines per athlete").
//
// NO SCHEMA CHANGE (the brief's own rule). MirrorSession already carries two untyped Json columns —
// timeInStableMs and faultCounts (prisma/schema.prisma) — written by app/api/mirror/sessions/route.ts. This module
// stores each session's per-check numeric readings as ONE MORE key inside faultCounts, `_checkValues`, so a
// baseline can be built later by reading sessions back out. It never touches faultCounts' existing zone-keyed
// counts (recordCheckValues below is additive: it spreads the old object first) and it never adds a column.
//
// Pure: no Prisma import here on purpose. The route (or a test) hands this module plain objects shaped like the
// rows it already has (createdAt, patternId, faultCounts); this module never opens a database connection itself.
//
// BASELINES NEVER PAY OR CHANGE A SCORED NUMBER (the brief's own rule, repeated because it is easy to get backwards
// under a refactor): compareToBaseline below returns a COMPARISON, not a status. The 'ok' / 'fault' / 'unreadable'
// a pattern's audit reports still comes ONLY from that pattern's own fixed threshold table — a baseline can only
// ever add a "vs your baseline: better/same/worse" alongside that, or "building your baseline (n/3)" before one
// exists. Nothing here can turn a threshold 'fault' into an 'ok', or move a reward.

/** Which direction is an IMPROVEMENT for a given check — set by the audit that owns the check, not guessed here. */
export type CheckDirection = 'lowerIsBetter' | 'higherIsBetter';

export interface PersonalBaselineCheck {
  /** The median of the values recorded for this check across the sessions counted in `sessionsUsed`. */
  median: number;
  /** How many of those sessions actually carried a numeric value for THIS check (a check unreadable in one of
   *  the athlete's first three sessions is simply not counted — see computeBaseline). */
  n: number;
}

export interface PersonalBaseline {
  patternId: string;
  /** How many of the athlete's readable sessions of this pattern were used to build it (capped at 3 — later
   *  sessions never move a baseline once it exists; see computeBaseline's header). */
  sessionsUsed: number;
  checks: Record<string, PersonalBaselineCheck>;
}

export type BaselineComparison =
  | { kind: 'building'; sessionsUsed: number; need: 3 }
  | { kind: 'compared'; status: 'better' | 'same' | 'worse'; value: number; baselineValue: number };

/** Reserved key inside the MirrorSession.faultCounts Json blob. A leading underscore keeps it out of the way of
 *  every real zone/fault name the pattern audits already write there (none of them starts with one). */
const CHECK_VALUES_KEY = '_checkValues';

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge this session's per-check readings into a faultCounts blob about to be written, additively: whatever the
 * pattern's own audit already put in `faultCounts` (zone-keyed counts, today) is kept exactly as it was.
 */
export function recordCheckValues(faultCounts: unknown, values: Readonly<Record<string, number>>): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(faultCounts) ? { ...faultCounts } : {};
  base[CHECK_VALUES_KEY] = { ...values };
  return base;
}

/** The inverse read: a session's stored per-check values, or null when the row predates this feature or carries none. */
export function readCheckValues(faultCounts: unknown): Record<string, number> | null {
  if (!isPlainObject(faultCounts)) return null;
  const raw = faultCounts[CHECK_VALUES_KEY];
  if (!isPlainObject(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

function median(nums: readonly number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The shape computeBaseline reads — exactly what a MirrorSession row already has, nothing Prisma-specific. */
export interface BaselineSessionRow {
  patternId: string;
  createdAt: Date | string | number;
  faultCounts: unknown;
}

/**
 * Build an athlete's baseline for one pattern from their session history (any order in — this sorts). Uses the
 * FIRST THREE sessions of that pattern that carried any stored check values (i.e. were readable enough for the
 * audit to record something), oldest first, and never more than that: a baseline set on day one does not drift
 * as the athlete's form changes later — that is the whole point of comparing against it (assumption: "readable
 * session" here means "recorded at least one check value"; a session where every check came back 'unreadable'
 * never wrote to `_checkValues` and is skipped the same way an athlete would expect a blank read to not count).
 */
export function computeBaseline(patternId: string, history: readonly BaselineSessionRow[]): PersonalBaseline {
  const rows = history
    .filter((r) => r.patternId === patternId)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((r) => readCheckValues(r.faultCounts))
    .filter((v): v is Record<string, number> => v != null && Object.keys(v).length > 0)
    .slice(0, 3);

  const checks: Record<string, PersonalBaselineCheck> = {};
  const ids = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) ids.add(k);
  for (const id of ids) {
    const vals = rows.map((r) => r[id]).filter((v): v is number => typeof v === 'number');
    if (vals.length) checks[id] = { median: median(vals), n: vals.length };
  }
  return { patternId, sessionsUsed: rows.length, checks };
}

/** Within this fraction of the baseline reads as "same" — noise, not a trend. FEL judgement, conservative: wide
 *  enough that ordinary day-to-day wobble does not read as "worse" and discourage someone who is actually fine. */
const SAME_BAND = 0.08;

/**
 * Compare one session's value for one check against the athlete's own baseline. Returns 'building' (with how many
 * of the needed 3 sessions exist so far) until a baseline for THIS check exists; never returns a status from a
 * fixed threshold — that is the audit's own job, unaffected by anything in this module (see the header).
 */
export function compareToBaseline(
  value: number,
  checkId: string,
  direction: CheckDirection,
  baseline: PersonalBaseline | undefined,
): BaselineComparison {
  const check = baseline?.checks[checkId];
  // fewer than 3 readings for THIS check is not a baseline yet, even if the pattern's OTHER checks already have
  // one (a check unreadable in one of the athlete's early sessions catches up on its own schedule, not the
  // pattern's) — see computeBaseline's "a check missing from one of the first 3 sessions" case.
  if (!check || check.n < 3) return { kind: 'building', sessionsUsed: baseline?.sessionsUsed ?? 0, need: 3 };
  const scale = Math.max(Math.abs(check.median), 1e-6);
  const delta = (value - check.median) / scale;
  const status: 'better' | 'same' | 'worse' =
    Math.abs(delta) <= SAME_BAND ? 'same' : (direction === 'lowerIsBetter') === (delta < 0) ? 'better' : 'worse';
  return { kind: 'compared', status, value, baselineValue: check.median };
}

/** A short, display-ready phrase for a comparison — what a pattern's `note` or an extra per-fault field can show
 *  without the harness needing to know this module's types (MIRROR-COACH P4: "no harness edits beyond what the
 *  registry drives" — this keeps the harness's job to printing a string it is handed). */
export function describeBaseline(cmp: BaselineComparison, fmt: (n: number) => string = (n) => n.toFixed(2)): string {
  if (cmp.kind === 'building') return `building your baseline (${cmp.sessionsUsed}/${cmp.need})`;
  return `vs your baseline: ${cmp.status} (${fmt(cmp.value)} vs ${fmt(cmp.baselineValue)})`;
}

// ── "vs your last 3" (MIRROR-PROGRESS, plan Phase 4, 2026-10-07) ─────────────────────────────────────────────────────
//
// The baseline above is FIXED (the first three sessions, never moved). The Mirror's review also says how today's set sits
// against the athlete's most RECENT sets — "vs your last 3" — which is what a returning athlete reads as "am I getting
// better lately". Same rules as the baseline: a comparison, never a status, never a reward; the audit's own threshold
// table still says what faulted. The values compared come from lib/mirror/progressReading.ts (one headline number per
// movement), read either from the server (an opted-in adult's saved sessions) or from this phone (everyone else:
// lib/mirror/deviceProgress.ts). This function does not know or care which.

/** How many recent sets "vs your last 3" reads. */
export const RECENT_SETS = 3;

export type RecentComparison =
  | { kind: 'first' }
  | { kind: 'compared'; status: 'better' | 'same' | 'worse'; value: number; recentMean: number; n: number };

/**
 * Today's value against the mean of the last (up to) RECENT_SETS values before it, oldest first in `priors` (only the
 * newest RECENT_SETS are read). `sameBand` is ABSOLUTE, in the value's own unit (a share of reps reads "the same" within
 * a rep or so — see progressReading.ts) — the relative SAME_BAND above misreads a share near zero, where 0.05 against
 * 0.04 is "25% worse". 'first' when there is nothing before it. Non-finite priors are dropped, never averaged in.
 */
export function compareToRecent(value: number, priors: readonly number[], direction: CheckDirection, sameBand: number): RecentComparison {
  const recent = priors.filter((p) => typeof p === 'number' && Number.isFinite(p)).slice(-RECENT_SETS);
  if (!recent.length || !Number.isFinite(value)) return { kind: 'first' };
  const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const delta = value - recentMean;
  const status: 'better' | 'same' | 'worse' =
    Math.abs(delta) <= sameBand ? 'same' : (direction === 'lowerIsBetter') === (delta < 0) ? 'better' : 'worse';
  return { kind: 'compared', status, value, recentMean, n: recent.length };
}
