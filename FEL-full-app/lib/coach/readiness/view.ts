// lib/coach/readiness/view.ts — COACH-READINESS (2026-10-25): one read of the day, as the athlete's screen shows it. The
// server (a saved check) and the phone (a check kept on the device) build the same view from the same pure steps.
//
// Pure, client-safe.

import { BAND_LABEL, coachedNextLine, reasonLine, soloLine } from './copy';
import { applyRule, athleteRead, baselineOf, measure, SOLO_RULE } from './rules';
import type { DayJumps, PriorCheck, ReadinessBand, ReadinessFacts, ReadinessRead, ReadinessReason, ReadinessRule } from './types';

/** The rule each of the athlete's coaches has for them, as the check's context gives it (no coach = solo). */
export interface CoachRuleCtx { coachId: string; coachName: string; rule: ReadinessRule; shared: boolean }

export interface ReadinessView {
  day: string;
  band: ReadinessBand;
  reason: ReadinessReason;
  label: string;
  line: string;
  /** What happens next: a coached athlete's (eased / told), or a solo athlete's suggestion. */
  next: string | null;
  solo: boolean;
  bestCm: number;
  meanCm: number;
  feel: number | null;
  baselineCm: number | null;
  baselineN: number;
  dropPct: number | null;
  realChangeCm: number | null;
  belowReal: boolean;
  ease: boolean;
  rule: ReadinessRule;
  coachTold: boolean;
}

/** Read one day against prior checks and the coaches' rules. */
export function readDay(today: DayJumps, prior: readonly PriorCheck[], feel: number | null, coaches: readonly CoachRuleCtx[]): { facts: ReadinessFacts; read: ReadinessRead; perCoach: { coachId: string; read: ReadinessRead }[] } {
  const base = baselineOf(prior, today.day);
  const facts = measure(today, base, feel);
  const prev = [...prior].filter((c) => c.day < today.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null;
  const perCoach = coaches.map((c) => ({ coachId: c.coachId, read: applyRule(facts, c.rule, prev, today.day) }));
  const read = athleteRead(perCoach.map((p) => p.read), applyRule(facts, SOLO_RULE, prev, today.day));
  return { facts, read, perCoach };
}

/** The screen's view of a read. `told` = the coach ids told today; `saved` = it is kept on the server. */
export function viewOf(o: { today: DayJumps; facts: ReadinessFacts; read: ReadinessRead; priorChecks: number; coaches: readonly CoachRuleCtx[]; told: readonly string[]; saved: boolean }): ReadinessView {
  const { facts, read } = o;
  const solo = o.coaches.length === 0;
  // the coach the band came from: the one whose rule read it (the easing one first), named in the next line
  const lead = o.coaches.find((c) => c.rule === read.rule) ?? o.coaches[0] ?? null;
  const coachTold = !!lead && o.saved && o.told.includes(lead.coachId);
  const next = solo
    ? soloLine(read.band)
    : coachedNextLine({ band: read.band, ease: read.ease && o.saved, coachName: lead?.coachName ?? null, coachTold, shared: !!lead?.shared });
  return {
    day: o.today.day, band: read.band, reason: read.reason, label: BAND_LABEL[read.band],
    line: reasonLine({ reason: read.reason, dropPct: facts.dropPct, feel: facts.feel, baselineN: facts.baseline?.n ?? 0, priorChecks: o.priorChecks, ruleDropPct: read.rule.dropPct }),
    next, solo, bestCm: o.today.bestCm, meanCm: o.today.meanCm, feel: facts.feel, baselineCm: facts.baseline?.bestCm ?? null, baselineN: facts.baseline?.n ?? 0,
    dropPct: facts.dropPct, realChangeCm: facts.realChangeCm, belowReal: facts.belowReal, ease: read.ease && (solo || o.saved), rule: read.rule, coachTold,
  };
}

/** One point of the trend line. */
export interface TrendPoint { day: string; bestCm: number; band: ReadinessBand }
