// lib/coach/readiness/survey.ts — COACH-DELIVERY COA-03 (2026-10-26): the five-question readiness survey, beside the jump
// check, for a team with no room to jump. The pure half.
//
// THE QUESTIONS are FEL's own (lib/health/readiness.ts READINESS_ITEMS: sleep, soreness, energy, mood — the daily
// check-in's words, the IP rule) plus one more, "Ready to train?". All five are asked, each 1–5.
// THE READ is the daily check-in's own rule, not a new one: an answer is low at LOW_ITEM_STRAIN or worse, and the day is
// low with LOW_ITEMS_FOR_LOW_DAY low answers or any one at the very worst end (WORST_STRAIN). There is no "Ready" band:
// a survey is how someone feels, not a measured change, so it reads Normal or Low only.
// THE COACH'S RULE (lib/coach/readiness/rules.ts, the one the jump check reads) decides what a Low does: 'drop_pct' — the
// survey's low IS the drop past the line (a survey has no percentage); 'low_twice' — low today AND on the survey before,
// within TWICE_GAP_DAYS. The action is the rule's: 'ease' eases today's session (./ease.ts, never harder), 'tell' leaves it.
//
// GATES (./gate.ts and the health rules): adults only, like the jump check (checkAccess). The answers are HEALTH DATA:
// saved only for a verified adult with a live health_data grant (lib/privacy/healthWriteGate.ts row i), seen by a coach
// only with that athlete's live coach_view grant (coachMaySee). No medical words (MEDICAL_WORDS; tested).
//
// Pure, client-safe.
import { LOW_ITEM_STRAIN, LOW_ITEMS_FOR_LOW_DAY, READINESS_ITEMS, WORST_STRAIN, isPlausibleToday, strainOf, type ReadinessItem } from '@/lib/health/readiness';
import { dayNumber } from './rules';
import { TWICE_GAP_DAYS } from './thresholds';
import type { ReadinessRead, ReadinessRule } from './types';

export type SurveyItemId = 'sleep' | 'soreness' | 'energy' | 'mood' | 'ready';

export interface SurveyItem { id: SurveyItemId; prompt: string; anchors: { 1: string; 5: string }; highIsGood: boolean; short: string }

/** The fifth question (FEL's own words, like the four it joins). */
export const READY_ITEM: SurveyItem = { id: 'ready', prompt: 'Ready to train?', anchors: { 1: 'Not today', 5: 'Fully' }, highIsGood: true, short: 'readiness to train' };

export const SURVEY_ITEMS: readonly SurveyItem[] = [...READINESS_ITEMS, READY_ITEM];

export type SurveyAnswers = Record<SurveyItemId, number>;
export type SurveyBand = 'normal' | 'low';

/** A request's answers and day, or why not. Every one of the five, a whole number 1–5; the day plausibly today. */
export function cleanSurvey(body: unknown, now: Date = new Date()): { ok: true; day: string; answers: SurveyAnswers } | { ok: false; error: 'not_today' | 'answer' } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isPlausibleToday(b.day, now)) return { ok: false, error: 'not_today' };
  const raw = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>;
  const answers = {} as SurveyAnswers;
  for (const item of SURVEY_ITEMS) {
    const v = raw[item.id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return { ok: false, error: 'answer' };
    answers[item.id] = v;
  }
  return { ok: true, day: b.day as string, answers };
}

/** The daily check-in's rule over the five answers (see the header). */
export function readSurvey(a: SurveyAnswers): { band: SurveyBand; lowItems: SurveyItemId[] } {
  const strains = SURVEY_ITEMS.map((item) => ({ id: item.id, strain: strainOf(item as unknown as ReadinessItem, a[item.id]) }));
  const lowItems = strains.filter((s) => s.strain >= LOW_ITEM_STRAIN).map((s) => s.id);
  const band: SurveyBand = lowItems.length >= LOW_ITEMS_FOR_LOW_DAY || strains.some((s) => s.strain >= WORST_STRAIN) ? 'low' : 'normal';
  return { band, lowItems };
}

/** A stored survey, as the rules read it. */
export interface SurveyDay { day: string; band: SurveyBand; lowItems: number }

/** Today's survey under one coach's rule (see the header). `prior` = earlier surveys, any order. */
export function applySurveyRule(today: SurveyDay, rule: ReadinessRule, prior: readonly SurveyDay[]): ReadinessRead {
  if (today.band !== 'low') return { band: 'normal', reason: 'survey_ok', rule, ease: false };
  if (rule.kind === 'low_twice') {
    const prev = [...prior].filter((p) => p.day < today.day).sort((x, y) => (x.day < y.day ? 1 : -1))[0];
    const twice = !!prev && prev.band === 'low' && dayNumber(today.day) - dayNumber(prev.day) <= TWICE_GAP_DAYS;
    return twice ? { band: 'low', reason: 'low_twice', rule, ease: rule.action === 'ease' } : { band: 'normal', reason: 'survey_ok', rule, ease: false };
  }
  return { band: 'low', reason: 'survey_low', rule, ease: rule.action === 'ease' };
}

/** The low answers, by their short names, for the coach who may see them ("sleep, energy"). */
export function lowItemsLine(ids: readonly SurveyItemId[]): string {
  return ids.map((id) => SURVEY_ITEMS.find((i) => i.id === id)?.short ?? id).join(', ');
}

// ── copy (DRAFT, owner review; held to MEDICAL_WORDS in tests/coach-delivery/readiness-survey.test.ts) ─────────────────
export const SURVEY_INTRO = 'No room to jump? Five quick questions instead. Your coach\'s rule reads them the same way it reads the jump check.';
export const SURVEY_SAVED_NORMAL = 'Thanks. Today reads normal: train as planned.';
export const SURVEY_SAVED_LOW = 'Today reads low. If your coach\'s rule eases the day, Today shows what changed.';
export const SURVEY_CONSENT_LINE = 'Your answers are health data, so they are saved only after you turn on health data in Profile. Nothing was saved.';
export const SURVEY_ONE_A_DAY = 'Today\'s check-in is in. One a day; come back tomorrow.';
export const SURVEY_FIXED_LINES = [SURVEY_INTRO, SURVEY_SAVED_NORMAL, SURVEY_SAVED_LOW, SURVEY_CONSENT_LINE, SURVEY_ONE_A_DAY];
