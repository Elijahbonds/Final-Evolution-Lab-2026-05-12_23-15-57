// lib/coach/readiness/rules.ts — COACH-READINESS (2026-10-25): the baseline, the day against it, and the coach's rule.
//
// THE OWNER'S ASK (coaching decisions 2026-10-24): "a 30-second daily jump check; if readiness drops past the coach's
// threshold, the day eases off and the coach is told."
//
// THREE STEPS, KEPT APART so each is tested on its own:
//   1. baselineOf — the athlete's OWN rolling normal: the newest BASELINE_MAX_CHECKS prior checks inside
//      BASELINE_WINDOW_DAYS, Low days left out (a run of tired days must not become the new normal), at least
//      BASELINE_MIN_CHECKS of them. Its day spread (`dayTeCm`) is the larger of the days' own SD (best and mean), the
//      camera's part (each day's typical error from lib/jump/session.ts over √jumps: a best-of-3 is read from three)
//      and the body's own CV (jump.bioCvPct) of the baseline.
//   2. measure — today against it, before any rule: the drop in % of the best and of the mean, and whether BOTH are
//      past the smallest real change. That change is lib/jump/session.ts realChange — JUMP-PRO's own test, the same z
//      (jump.realChangeZ) — with today's spread for "now" and the baseline mean's own error (spread ÷ √n) for "before".
//      So NORMAL NOISE NEVER READS AS A DROP: a day inside the measurement's own noise is never `belowReal`, and no
//      rule below can call a day Low unless it is.
//   3. applyRule — the coach's rule on top: "a drop of X % or more" (drop_pct; a real dip with a low "how do you feel"
//      also reads Low), or "below the smallest real change twice in a row" (low_twice). The action is the coach's too:
//      ease off today, or tell me only.
//
// Pure: rows in, a read out. No clock but the `today` string each function takes.

import { realChange } from '@/lib/jump/session';
import { jr } from '@/lib/jump/PROPOSED-jump';
import {
  BASELINE_MAX_CHECKS, BASELINE_MIN_CHECKS, BASELINE_WINDOW_DAYS, DRAFT_LOW_CHECKS, DROP_PCT, FEEL_LOW_MAX, TWICE_GAP_DAYS,
} from './thresholds';
import type {
  Baseline, DayJumps, PriorCheck, ReadinessBand, ReadinessFacts, ReadinessRead, ReadinessRule, RuleAction, RuleKind, StoredRule,
} from './types';

const DAY_MS = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** 'YYYY-MM-DD' → days since the epoch (UTC), or NaN. */
export function dayNumber(day: string): number {
  const m = DAY_RE.exec(day);
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : NaN;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sampleSd = (xs: readonly number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/** The athlete's own normal, from checks BEFORE `today` (Low days left out). null until there are enough. */
export function baselineOf(prior: readonly PriorCheck[], today: string): Baseline | null {
  const t = dayNumber(today);
  const usable = prior
    .filter((c) => { const d = dayNumber(c.day); return d < t && t - d <= BASELINE_WINDOW_DAYS && c.band !== 'low' && c.bestCm > 0 && c.meanCm > 0; })
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, BASELINE_MAX_CHECKS);
  if (usable.length < BASELINE_MIN_CHECKS) return null;
  const bests = usable.map((c) => c.bestCm), means = usable.map((c) => c.meanCm);
  const bestCm = mean(bests), meanCm = mean(means);
  // a day's numbers are a best and a mean of several jumps: the camera's part of their noise is the trials' typical
  // error over √(jumps); the rest is the body's own day-to-day spread, read from the days themselves
  const camTe = Math.sqrt(mean(usable.map((c) => (c.teCm * c.teCm) / Math.max(1, c.jumps))));
  const dayTeCm = Math.max(sampleSd(bests), sampleSd(means), camTe, (bestCm * jr('jump.bioCvPct')) / 100);
  return { n: usable.length, bestCm: r1(bestCm), meanCm: r1(meanCm), dayTeCm: r1(dayTeCm), days: usable.map((c) => c.day) };
}

/** Today against the baseline, before any rule. */
export function measure(today: DayJumps, base: Baseline | null, feel: number | null): ReadinessFacts {
  if (!base) return { baseline: null, dropPct: null, meanDropPct: null, realChangeCm: null, belowReal: false, aboveReal: false, feel };
  const nowTe = Math.max(today.teCm / Math.sqrt(Math.max(1, today.jumps)), base.dayTeCm);
  const beforeTe = base.dayTeCm / Math.sqrt(base.n);
  const best = realChange({ cm: today.bestCm, teCm: nowTe }, { cm: base.bestCm, teCm: beforeTe });
  const avg = realChange({ cm: today.meanCm, teCm: nowTe }, { cm: base.meanCm, teCm: beforeTe });
  return {
    baseline: base,
    dropPct: r1(((base.bestCm - today.bestCm) / base.bestCm) * 100),
    meanDropPct: r1(((base.meanCm - today.meanCm) / base.meanCm) * 100),
    realChangeCm: best.bandCm,
    belowReal: best.kind === 'down' && avg.kind === 'down',
    aboveReal: best.kind === 'up' && avg.kind === 'up',
    feel,
  };
}

export const feelIsLow = (feel: number | null): boolean => feel != null && feel <= FEEL_LOW_MAX;

/** The rule a coach gets when they have set none (new, owner call): a 7 % drop past the noise, and the day eases. */
export const DEFAULT_RULE: ReadinessRule = { kind: 'drop_pct', dropPct: DROP_PCT.default, action: 'ease', source: 'default' };
/** A solo athlete (no coach): the same reading, and a suggestion only — nothing is changed for them. */
export const SOLO_RULE: ReadinessRule = { ...DEFAULT_RULE };

/** The band and the reason under one rule. `prev` is the newest check before today (for low_twice). */
export function applyRule(f: ReadinessFacts, rule: ReadinessRule, prev: PriorCheck | null, today: string): ReadinessRead {
  const read = (band: ReadinessBand, reason: ReadinessRead['reason']): ReadinessRead => ({ band, reason, rule, ease: band === 'low' && rule.action === 'ease' });
  if (!f.baseline) return read('building', 'building');
  if (f.belowReal) {
    if (rule.kind === 'low_twice') {
      const gap = prev ? dayNumber(today) - dayNumber(prev.day) : Infinity;
      return prev?.belowReal && gap >= 1 && gap <= TWICE_GAP_DAYS ? read('low', 'low_twice') : read('normal', 'dip_small');
    }
    if ((f.dropPct ?? 0) >= rule.dropPct) return read('low', 'low_drop');
    if (feelIsLow(f.feel)) return read('low', 'low_drop_feel');
    return read('normal', 'dip_small');
  }
  if (f.aboveReal) return feelIsLow(f.feel) ? read('normal', 'feel_caps') : read('ready', 'up');
  return read('normal', (f.dropPct ?? 0) > 0 ? 'dip_noise' : 'steady');
}

// ── the coach's rule: what a coach may set, and which one applies ─────────────────────────────────────────────────

export const RULE_KINDS: readonly RuleKind[] = ['drop_pct', 'low_twice'];
export const RULE_ACTIONS: readonly RuleAction[] = ['ease', 'tell'];

/** A rule from a request body, or the reason it is refused. The percent is a whole or half number inside DROP_PCT. */
export function cleanRule(body: unknown): { ok: true; rule: { kind: RuleKind; dropPct: number; action: RuleAction } } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const kind = b.kind, action = b.action;
  if (typeof kind !== 'string' || !RULE_KINDS.includes(kind as RuleKind)) return { ok: false, error: 'bad_kind' };
  if (typeof action !== 'string' || !RULE_ACTIONS.includes(action as RuleAction)) return { ok: false, error: 'bad_action' };
  const pct = b.dropPct === undefined ? DROP_PCT.default : Number(b.dropPct);
  if (!Number.isFinite(pct) || pct < DROP_PCT.min || pct > DROP_PCT.max || Math.round(pct * 2) !== pct * 2) return { ok: false, error: 'bad_drop_pct' };
  return { ok: true, rule: { kind: kind as RuleKind, dropPct: pct, action: action as RuleAction } };
}

/**
 * Which of one coach's rules applies to one athlete: the athlete's own, else a team's they are on (the most protective
 * of several), else the default. `teamIds` = the athlete's teams that THIS coach runs.
 */
export function ruleFor(coachRules: readonly StoredRule[], athleteId: string, teamIds: readonly string[]): ReadinessRule {
  const own = coachRules.find((r) => r.scope === 'athlete' && r.scopeId === athleteId);
  if (own) return { kind: own.kind, dropPct: own.dropPct, action: own.action, source: 'athlete' };
  const teams = coachRules.filter((r) => r.scope === 'team' && teamIds.includes(r.scopeId));
  if (teams.length) {
    const t = [...teams].sort((a, b) => protectiveRank(b) - protectiveRank(a))[0];
    return { kind: t.kind, dropPct: t.dropPct, action: t.action, source: 'team' };
  }
  return { ...DEFAULT_RULE };
}

/** Higher = eases sooner: an ease rule before a tell rule; then drop_pct before low_twice; then the lower percent. */
function protectiveRank(r: Pick<StoredRule, 'kind' | 'dropPct' | 'action'>): number {
  return (r.action === 'ease' ? 1000 : 0) + (r.kind === 'drop_pct' ? 100 : 0) - r.dropPct;
}

/** Several coaches' reads of one day, as the athlete sees it: Low if any coach's rule reads Low, the easing if any eases. */
export function athleteRead(reads: readonly ReadinessRead[], fallback: ReadinessRead): ReadinessRead {
  if (!reads.length) return fallback;
  const lows = reads.filter((r) => r.band === 'low');
  if (lows.length) return lows.find((r) => r.ease) ?? lows[0];
  return reads[0];
}

// ── the weekly draft ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The weekly draft's deload trigger from the jump check (lib/coach/weeklyDraft/rules.ts reads it): DRAFT_LOW_CHECKS Low
 * checks in the last 7 days, or null. Its words are fixed and the change it feeds is marked sensitive (health-adjacent).
 */
export function draftTrigger(f: { lowDays: number; days: number } | null | undefined): string | null {
  return f && f.lowDays >= DRAFT_LOW_CHECKS ? `Their daily jump check read Low on ${f.lowDays} of their last ${f.days} checks.` : null;
}
