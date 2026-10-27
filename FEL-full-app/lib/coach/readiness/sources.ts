// lib/coach/readiness/sources.ts — COACH-DELIVERY (2026-10-26): today's readiness from the two checks that are not the jump
// check — a warm-up BAR-SPEED set (lib/vbt, docs/VBT.md §7.3) and the five-question SURVEY (./survey.ts, COA-03) — read by
// the same coach's rule, so Today eases and the coach hears about it the same way. No new rule engine:
//   · bar speed goes through lib/vbt/readiness.ts readBarSpeed (the readiness steps, unchanged: baseline, measure, applyRule);
//   · the survey through ./survey.ts applySurveyRule (the daily check-in's low, the coach's rule kind and action).
//
// TODAY (server.ts todayReadiness): the NEWEST of today's checks stands, whichever kind (the VBT doc's proposal).
// THE COACH (server.ts coachBoard): a Low from either source is an alert on the board, computed on read — once per athlete
// per day by construction (one survey a day; the day's newest warm-up set), with no alert row (ReadinessAlert's checkId is
// a foreign key to the jump check, so these do not write one). The coach sees it only under the source's own gate:
//   · bar speed: the jump check's (live roster + coach_view + verified adult + the movement-save opt-in) — the caller's
//     `visible` set;
//   · survey: health data — live roster + coach_view + verified adult (coachMaySee); no movement opt-in is involved.
// So an athlete is "told" exactly when the coach can see it: `coachTold` = shared.
import 'server-only';
import { addDays, dayOf } from '@/lib/groups/week';
import { isPlausibleToday } from '@/lib/health/readiness';
import { readBarSpeed } from '@/lib/vbt/readiness';
import { barSpeedDays } from '@/lib/vbt/sets';
import { setsFor, setsForUsers, type RawDb } from '@/lib/vbt/store';
import { applySurveyRule, readSurvey, type SurveyDay } from './survey';
import { surveysFor, surveysForUsers, type StoredSurvey } from './surveyStore';
import { READINESS_TODAY_HOURS, TWICE_GAP_DAYS } from './thresholds';
import type { ReadinessReason, ReadinessRule, ReadinessSource, RuleAction, TodayReadiness } from './types';
import type { CoachRuleCtx } from './view';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** = lib/vbt/server.ts HISTORY_DAYS (the athlete's own bar-speed history); not imported, that module imports this one's
 *  neighbour (server.ts coachRules). tests/coach-delivery/readiness-sources.test.ts holds the two equal. */
export const BAR_HISTORY_DAYS = 90;
/** Survey history the twice-in-a-row rule reads back. */
const SURVEY_BACK_DAYS = TWICE_GAP_DAYS + 2;

export interface SourceToday { at: number; r: TodayReadiness }

const surveyDay = (s: StoredSurvey): SurveyDay => ({ day: s.day, band: s.band, lowItems: s.lowItems });
const recent = (createdAt: string, day: string, now: Date) => Date.parse(createdAt) >= now.getTime() - READINESS_TODAY_HOURS * HOUR && isPlausibleToday(day, now);

/** Today's survey under this coach's rule, or null (none today, or the table is not there). */
export async function surveyToday(db: RawDb, userId: string, ctx: CoachRuleCtx, now: Date): Promise<SourceToday | null> {
  const rows = await surveysFor(db, userId, addDays(dayOf(now), -SURVEY_BACK_DAYS), now.getTime());
  const today = rows?.find((s) => recent(s.createdAt, s.day, now));
  if (!today) return null;
  const read = applySurveyRule(surveyDay(today), ctx.rule, rows!.filter((s) => s.id !== today.id).map(surveyDay));
  return {
    at: Date.parse(today.createdAt),
    r: { band: read.band, reason: read.reason, ease: read.ease, dropPct: null, feel: null, baselineN: 0, rule: ctx.rule, coachTold: ctx.shared && read.band === 'low', shared: ctx.shared, day: today.day, source: 'survey' },
  };
}

/** Today's newest warm-up bar-speed set under this coach's rule, or null. */
export async function barSpeedToday(db: RawDb, userId: string, ctx: CoachRuleCtx, now: Date): Promise<SourceToday | null> {
  const sets = await setsFor(db, userId, new Date(now.getTime() - BAR_HISTORY_DAYS * DAY), 300, now.getTime());
  const newest = sets?.find((s) => s.warmup && s.band && recent(s.createdAt, s.day, now));
  if (!sets || !newest) return null;
  const today = barSpeedDays([newest])[0];
  if (!today) return null;
  const { facts, read } = readBarSpeed(today, barSpeedDays(sets.filter((s) => s.id !== newest.id)), [ctx]);
  return {
    at: Date.parse(newest.createdAt),
    r: { band: read.band, reason: read.reason, ease: read.ease, dropPct: facts.dropPct, feel: null, baselineN: facts.baseline?.n ?? 0, rule: ctx.rule, coachTold: ctx.shared && read.band === 'low', shared: ctx.shared, day: today.day, source: 'bar_speed' },
  };
}

export interface SourceAlert { id: string; athleteId: string; day: string; action: RuleAction; reason: ReadinessReason; dropPct: number | null; source: ReadinessSource; createdAt: string; seenAt: null }

/**
 * The coach's Lows from bar speed and the survey in the last `windowDays`, for the athletes they may see by each source's
 * gate. `ruleOf` gives this coach's current rule for an athlete (server.ts coachRules). One per athlete × day × source.
 */
export async function sourceAlerts(
  db: RawDb, o: { barSpeedIds: readonly string[]; surveyIds: readonly string[]; windowDays: number; ruleOf: (athleteId: string) => Promise<ReadinessRule | null> }, now: Date,
): Promise<SourceAlert[]> {
  const nowMs = now.getTime();
  const out: SourceAlert[] = [];
  const since = addDays(dayOf(now), -o.windowDays);
  const surveys = await surveysForUsers(db, o.surveyIds, addDays(since, -SURVEY_BACK_DAYS), nowMs);
  for (const id of o.surveyIds) {
    const mine = surveys.filter((s) => s.userId === id);
    for (const s of mine.filter((x) => x.day >= since && x.band === 'low')) {
      const rule = await o.ruleOf(id);
      if (!rule) continue;
      const read = applySurveyRule(surveyDay(s), rule, mine.filter((x) => x.id !== s.id).map(surveyDay));
      if (read.band === 'low') out.push({ id: `survey:${s.id}`, athleteId: id, day: s.day, action: rule.action, reason: read.reason, dropPct: null, source: 'survey', createdAt: s.createdAt, seenAt: null });
    }
  }
  if (o.barSpeedIds.length) {
    const sets = await setsForUsers(db, o.barSpeedIds, new Date(nowMs - BAR_HISTORY_DAYS * DAY), nowMs);
    for (const id of o.barSpeedIds) {
      const mine = sets.filter((s) => s.userId === id);
      const lows = mine.filter((s) => s.warmup && s.band === 'low' && s.day >= since);
      const seen = new Set<string>();
      for (const s of lows) {   // newest first: the day's newest warm-up set stands
        if (seen.has(s.day)) continue;
        seen.add(s.day);
        const rule = await o.ruleOf(id);
        const today = barSpeedDays([s])[0];
        if (!rule || !today) continue;
        const { facts, read } = readBarSpeed(today, barSpeedDays(mine.filter((x) => x.id !== s.id && x.day < s.day)), [{ coachId: 'c', coachName: '', rule, shared: true }]);
        if (read.band === 'low') out.push({ id: `vbt:${s.id}`, athleteId: id, day: s.day, action: rule.action, reason: read.reason, dropPct: facts.dropPct, source: 'bar_speed', createdAt: s.createdAt, seenAt: null });
      }
    }
  }
  return out;
}

/** The low answers of an athlete's newest survey (for a coach who may see it), or null. */
export function latestSurveyLow(rows: readonly StoredSurvey[], athleteId: string): { day: string; low: ReturnType<typeof readSurvey>['lowItems'] } | null {
  const s = rows.filter((x) => x.userId === athleteId).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  return s ? { day: s.day, low: readSurvey(s.answers).lowItems } : null;
}
