// lib/coach/readiness/surveyServer.ts — COACH-DELIVERY COA-03 (2026-10-26): the readiness survey's reads and writes.
//
//   surveyContext  GET    /api/coach/me/readiness-survey   may they answer, is health data on, today's answer if any
//   submitSurvey   POST   /api/coach/me/readiness-survey   five answers, once a day — health rules first (see below)
//   deleteMine     DELETE /api/coach/me/readiness-survey   every survey of the athlete's own
//
// THE ORDER OF THE GATES ON A WRITE (the readiness check-in's, route c): a verified adult (the route's own
// canWriteHealthData(prisma, userId) — HEALTH_WRITE_ROUTES i — passed in as `adultGate`; 403 health_data_adults_only),
// then a live health_data grant (412 health_data_consent_required), then the answers. Nothing is written before all pass.
// What the answer then does is the coach's rule's business (./sources.ts reads it for Today and the coach's board).
import 'server-only';
import { HEALTH_WRITE_REFUSED } from '@/lib/privacy/healthWriteGate';
import { activeHealthDataConsent, type ConsentRow } from '@/lib/health/consent';
import { addDays, dayOf } from '@/lib/groups/week';
import { deliveryReady, NOT_READY, res, type Res } from '../delivery/probe';
import { BAND_LABEL, coachedNextLine, reasonLine, ruleLine, soloLine } from './copy';
import { coachRules, type ReadinessDb } from './server';
import { applySurveyRule, cleanSurvey, lowItemsLine, readSurvey, SURVEY_CONSENT_LINE, SURVEY_ITEMS, SURVEY_ONE_A_DAY, type SurveyDay } from './survey';
import { deleteSurveys, insertSurvey, surveysFor, type StoredSurvey } from './surveyStore';
import { TWICE_GAP_DAYS } from './thresholds';

const day = (s: StoredSurvey): SurveyDay => ({ day: s.day, band: s.band, lowItems: s.lowItems });

async function healthDataOn(db: ReadinessDb, userId: string): Promise<boolean> {
  const rows = await db.healthConsent.findMany({ where: { userId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }).catch(() => []);
  return !!activeHealthDataConsent(rows as ConsentRow[]);
}

/** The athlete's read of one day, under each coach's rule (the easing one leads), or the solo suggestion. */
async function viewFor(db: ReadinessDb, userId: string, today: StoredSurvey, prior: readonly StoredSurvey[], now: Date) {
  const coaches = await coachRules(db, userId, now.getTime());
  const reads = coaches.map((c) => ({ c, read: applySurveyRule(day(today), c.rule, prior.map(day)) }));
  const lead = reads.find((x) => x.read.band === 'low' && x.read.ease) ?? reads.find((x) => x.read.band === 'low') ?? reads[0] ?? null;
  const band = lead ? lead.read.band : today.band;
  const reason = lead ? lead.read.reason : today.band === 'low' ? 'survey_low' : 'survey_ok';
  return {
    day: today.day, band, label: BAND_LABEL[band],
    line: reasonLine({ reason, dropPct: null, feel: null, baselineN: 0, priorChecks: 0, ruleDropPct: 0, source: 'survey' }),
    next: lead ? coachedNextLine({ band, ease: lead.read.ease, coachName: lead.c.coachName, coachTold: lead.c.shared && band === 'low', shared: lead.c.shared }) : soloLine(band),
    low: lowItemsLine(readSurvey(today.answers).lowItems),
    coaches: coaches.map((c) => ({ coachName: c.coachName, ruleLine: ruleLine(c.rule, { coachName: c.coachName }) })),
  };
}

export async function surveyContext(db: ReadinessDb, userId: string, adult: boolean, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  const ready = await deliveryReady(db, nowMs);
  const healthData = adult ? await healthDataOn(db, userId) : false;
  const base = { ok: true, adult, ready, healthData, items: SURVEY_ITEMS, consentLine: healthData ? null : SURVEY_CONSENT_LINE };
  if (!adult || !ready || !healthData) return res(200, { ...base, today: null });
  const rows = (await surveysFor(db, userId, addDays(dayOf(now), -(TWICE_GAP_DAYS + 2)), nowMs)) ?? [];
  const mine = rows.find((s) => s.day === dayOf(now)) ?? null;
  return res(200, { ...base, today: mine ? await viewFor(db, userId, mine, rows.filter((s) => s.id !== mine.id), now) : null });
}

export async function submitSurvey(db: ReadinessDb, userId: string, body: unknown, adultGate: () => Promise<boolean>, now: Date = new Date()): Promise<Res> {
  const nowMs = now.getTime();
  if (!(await deliveryReady(db, nowMs))) return NOT_READY;
  if (!(await adultGate())) return res(403, { ...HEALTH_WRITE_REFUSED });
  if (!(await healthDataOn(db, userId))) return res(412, { error: 'health_data_consent_required', saved: false, line: SURVEY_CONSENT_LINE });
  const c = cleanSurvey(body, now);
  if (!c.ok) return res(400, { error: c.error });
  const r = readSurvey(c.answers);
  const saved = await insertSurvey(db, userId, c.day, c.answers, r.lowItems.length, r.band, nowMs);
  if (saved === null) return NOT_READY;
  const rows = (await surveysFor(db, userId, addDays(c.day, -(TWICE_GAP_DAYS + 2)), nowMs)) ?? [];
  const today = rows.find((s) => s.day === c.day);
  if (!today) return res(500, { error: 'not_saved' });
  const view = await viewFor(db, userId, today, rows.filter((s) => s.id !== today.id), now);
  return res(200, { saved: true, first: saved, view, ...(saved ? {} : { line: SURVEY_ONE_A_DAY }) });
}

export async function deleteMine(db: ReadinessDb, userId: string, now: Date = new Date()): Promise<Res> {
  if (!(await deliveryReady(db, now.getTime()))) return NOT_READY;
  return (await deleteSurveys(db, userId, now.getTime())) ? res(200, { deleted: true }) : NOT_READY;
}
