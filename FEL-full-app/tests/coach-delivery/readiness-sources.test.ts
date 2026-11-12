// COACH-DELIVERY (2026-10-26): today's readiness from the two checks beside the jump check — the five-question survey
// (COA-03) and a warm-up bar-speed set (VBT, docs/VBT.md §7.3) — read by the coach's own rule, easing Today and alerting the
// coach the same way, under each source's own gate. And the survey's write rules (HEALTH_WRITE_ROUTES i).
import { beforeEach, describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { coachAlertLine, reasonLine } from '@/lib/coach/readiness/copy';
import { coachBoard, todayReadiness } from '@/lib/coach/readiness/server';
import { BAR_HISTORY_DAYS } from '@/lib/coach/readiness/sources';
import { applySurveyRule, cleanSurvey, readSurvey, SURVEY_FIXED_LINES, SURVEY_ITEMS } from '@/lib/coach/readiness/survey';
import { submitSurvey, surveyContext } from '@/lib/coach/readiness/surveyServer';
import { applyTodayReadiness } from '@/lib/coach/readiness/today';
import { DEFAULT_RULE } from '@/lib/coach/readiness/rules';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { resetReadinessProbe } from '@/lib/coach/readiness/store';
import { resetVbtProbe } from '@/lib/vbt/store';
import { HISTORY_DAYS } from '@/lib/vbt/server';
import { resetGroupsProbe } from '@/lib/groups/store';
import { fakeVbtDb, seedSet, type FakeVbtDb } from '@/tests/helpers/fakeVbtDb';
import { seedAthlete, seedCheck } from '@/tests/helpers/fakeReadinessDb';
import { withSurveys } from '@/tests/helpers/fakeDeliveryDb';

let db: FakeVbtDb;
let surveys: ReturnType<typeof withSurveys>;
let now: Date;
const anyDb = () => db as never;
const DAY = '2026-10-25';
const GOOD = { sleep: 4, soreness: 2, energy: 4, mood: 4, ready: 4 };
const LOW = { sleep: 2, soreness: 4, energy: 2, mood: 3, ready: 2 };
const yes = async () => true;
const healthData = (userId: string) => (db.grants as unknown as Record<string, unknown>[]).push({ userId, coachId: null, scope: 'health_data', grantedAt: new Date(0), revokedAt: null });

beforeEach(() => {
  resetDeliveryProbe(); resetReadinessProbe(); resetVbtProbe(); resetGroupsProbe();
  db = fakeVbtDb();
  surveys = withSurveys(db);
  now = new Date(db.clock);   // 2026-10-25 08:00 PT
  seedAthlete(db, 'ada', { coaches: ['c1'], name: 'Ada' });   // adult, opted in, shares with c1
  healthData('ada');
});

describe('the survey: questions, the read, the copy', () => {
  it('five questions, all required, 1–5, today only', () => {
    expect(SURVEY_ITEMS.map((i) => i.id)).toEqual(['sleep', 'soreness', 'energy', 'mood', 'ready']);
    expect(cleanSurvey({ day: DAY, answers: GOOD }, now)).toEqual({ ok: true, day: DAY, answers: GOOD });
    expect(cleanSurvey({ day: DAY, answers: { ...GOOD, ready: undefined } }, now)).toEqual({ ok: false, error: 'answer' });
    expect(cleanSurvey({ day: DAY, answers: { ...GOOD, mood: 6 } }, now)).toEqual({ ok: false, error: 'answer' });
    expect(cleanSurvey({ day: '2026-09-01', answers: GOOD }, now)).toEqual({ ok: false, error: 'not_today' });
  });

  it('the daily check-in\'s rule: two low answers, or one at the very worst, is a low day; nothing reads "Ready"', () => {
    expect(readSurvey(GOOD)).toEqual({ band: 'normal', lowItems: [] });
    expect(readSurvey(LOW).band).toBe('low');
    expect(readSurvey({ ...GOOD, sleep: 1 }).band).toBe('low');            // one at the worst end
    expect(readSurvey({ ...GOOD, soreness: 4 })).toEqual({ band: 'normal', lowItems: ['soreness'] });
  });

  it('the coach\'s rule: drop_pct reads a low survey as Low; low_twice needs the survey before too', () => {
    const low = { day: DAY, band: 'low' as const, lowItems: 3 };
    expect(applySurveyRule(low, DEFAULT_RULE, [])).toMatchObject({ band: 'low', reason: 'survey_low', ease: true });
    const twice = { ...DEFAULT_RULE, kind: 'low_twice' as const, action: 'tell' as const };
    expect(applySurveyRule(low, twice, [])).toMatchObject({ band: 'normal', reason: 'survey_ok' });
    expect(applySurveyRule(low, twice, [{ day: '2026-10-24', band: 'low', lowItems: 2 }])).toMatchObject({ band: 'low', reason: 'low_twice', ease: false });
  });

  it('no line names a cause, a condition or a treatment', () => {
    const lines = [...SURVEY_FIXED_LINES, ...SURVEY_ITEMS.flatMap((i) => [i.prompt, i.anchors[1], i.anchors[5]])];
    for (const source of ['jump', 'bar_speed', 'survey'] as const) {
      for (const reason of ['survey_ok', 'survey_low', 'low_twice', 'low_drop', 'up', 'steady'] as const) {
        lines.push(reasonLine({ reason, dropPct: 8, feel: null, baselineN: 4, priorChecks: 4, ruleDropPct: 5, source }));
        lines.push(coachAlertLine({ name: 'Ada', dropPct: 8, reason, action: 'ease', source }));
      }
    }
    for (const l of lines) expect(l, l).not.toMatch(MEDICAL_WORDS);
    expect(coachAlertLine({ name: 'Ada', dropPct: null, reason: 'survey_low', action: 'ease', source: 'survey' })).toBe("Ada's readiness survey read Low: their answers read low today. Today's session eased automatically.");
    expect(reasonLine({ reason: 'low_drop', dropPct: 12, feel: null, baselineN: 4, priorChecks: 4, ruleDropPct: 5, source: 'bar_speed' })).toMatch(/^Down 12% on your normal/);
    expect(reasonLine({ reason: 'up', dropPct: -3, feel: null, baselineN: 4, priorChecks: 4, ruleDropPct: 5 })).toMatch(/^Your jump is up/);   // unchanged for the jump check
  });
});

describe('the survey\'s write (HEALTH_WRITE_ROUTES i)', () => {
  it('before the pending SQL: 503, nothing written', async () => {
    surveys.tables.on = false;
    expect((await submitSurvey(anyDb(), 'ada', { day: DAY, answers: GOOD }, yes, now)).status).toBe(503);
    expect(((await surveyContext(anyDb(), 'ada', true, now)).body as { ready: boolean }).ready).toBe(false);
  });

  it('not a verified adult → 403 health_data_adults_only; no health_data grant → 412; nothing written', async () => {
    expect((await submitSurvey(anyDb(), 'ada', { day: DAY, answers: GOOD }, async () => false, now)).body).toEqual({ error: 'health_data_adults_only', saved: false });
    seedAthlete(db, 'bo', { coaches: ['c1'] });
    expect((await submitSurvey(anyDb(), 'bo', { day: DAY, answers: GOOD }, yes, now))).toMatchObject({ status: 412, body: { error: 'health_data_consent_required', saved: false } });
    expect(surveys.rows).toEqual([]);
  });

  it('saves once a day (the first stands), and reads it under the coach\'s rule', async () => {
    const r = await submitSurvey(anyDb(), 'ada', { day: DAY, answers: LOW }, yes, now);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ saved: true, first: true, view: { band: 'low', label: 'Low', line: 'Your check-in reads low today.' } });
    expect((r.body as { view: { next: string } }).view.next).toMatch(/eased.*Coach c1 has been told/);
    const again = await submitSurvey(anyDb(), 'ada', { day: DAY, answers: GOOD }, yes, now);
    expect(again.body).toMatchObject({ saved: true, first: false, view: { band: 'low' } });
    expect(surveys.rows).toHaveLength(1);
  });
});

describe('Today and the coach, from the survey', () => {
  it('a Low survey eases Today under an "ease off" rule and tells the coach who may see it', async () => {
    await submitSurvey(anyDb(), 'ada', { day: DAY, answers: LOW }, yes, now);
    const t = await todayReadiness(anyDb(), 'ada', 'c1', now);
    expect(t).toMatchObject({ band: 'low', reason: 'survey_low', ease: true, coachTold: true, shared: true, source: 'survey' });
    const note = applyTodayReadiness([], t, { youth: false, coachName: 'Coach c1' }).note!;
    expect(note.line).toBe('Your check-in reads low today.');
    const board = (await coachBoard(anyDb(), 'c1', now)).body as { alerts: { source: string; line: string }[] };
    expect(board.alerts).toEqual([expect.objectContaining({ source: 'survey', line: "Ada's readiness survey read Low: their answers read low today. Today's session eased automatically." })]);
  });

  it('a coach without the athlete\'s coach_view grant is told nothing (health data)', async () => {
    db.grants = db.grants.filter((g) => g.scope !== 'coach_view');
    await submitSurvey(anyDb(), 'ada', { day: DAY, answers: LOW }, yes, now);
    expect(await todayReadiness(anyDb(), 'ada', 'c1', now)).toMatchObject({ band: 'low', coachTold: false, shared: false });
    expect(((await coachBoard(anyDb(), 'c1', now)).body as { alerts: unknown[] }).alerts).toEqual([]);
  });

  it('the newest of today\'s checks stands: a normal survey after an earlier Low jump check reads normal', async () => {
    for (const d of [4, 3, 2]) seedCheck(db, 'ada', d, 40);
    seedCheck(db, 'ada', 0, 34, { band: 'low', belowReal: true, dropPct: 15, baselineN: 3, baselineCm: 40 });
    db.checks[db.checks.length - 1].createdAt = new Date(db.clock - 3_600_000);
    expect(await todayReadiness(anyDb(), 'ada', 'c1', now)).toMatchObject({ band: 'low', source: 'jump' });
    await submitSurvey(anyDb(), 'ada', { day: DAY, answers: GOOD }, yes, now);
    expect(await todayReadiness(anyDb(), 'ada', 'c1', now)).toMatchObject({ band: 'normal', reason: 'survey_ok', ease: false, source: 'survey' });
  });
});

describe('Today and the coach, from a warm-up bar-speed set (docs/VBT.md §7.3)', () => {
  const warm = (daysAgo: number, repMcvs: number[], band: string) => seedSet(db, 'ada', daysAgo, { warmup: true, band, repMcvs });

  it('a Low warm-up eases Today and alerts the coach; a normal one does neither', async () => {
    for (const d of [6, 4, 2]) warm(d, [0.62, 0.6, 0.58], 'normal');
    warm(0, [0.51, 0.5, 0.49], 'low');
    const t = await todayReadiness(anyDb(), 'ada', 'c1', now);
    expect(t).toMatchObject({ band: 'low', reason: 'low_drop', ease: true, coachTold: true, source: 'bar_speed' });
    expect(t!.dropPct).toBeGreaterThan(10);
    expect(applyTodayReadiness([], t, { youth: false, coachName: 'Coach c1' }).note!.line).toMatch(/^Down 1\d(\.\d)?% on your normal/);
    const board = (await coachBoard(anyDb(), 'c1', now)).body as { alerts: { source: string; line: string }[] };
    expect(board.alerts).toEqual([expect.objectContaining({ source: 'bar_speed' })]);
    expect(board.alerts[0].line).toMatch(/^Ada's warm-up bar speed read Low: down 1\d/);
  });

  it('a normal warm-up: Today as written', async () => {
    for (const d of [6, 4, 2]) warm(d, [0.62, 0.6, 0.58], 'normal');
    warm(0, [0.62, 0.61, 0.58], 'normal');
    expect(await todayReadiness(anyDb(), 'ada', 'c1', now)).toMatchObject({ band: 'normal', ease: false, source: 'bar_speed' });
    expect(((await coachBoard(anyDb(), 'c1', now)).body as { alerts: unknown[] }).alerts).toEqual([]);
  });

  it('the coach sees a bar-speed Low only under the jump check\'s gate (the movement-save opt-in too)', async () => {
    for (const d of [6, 4, 2]) warm(d, [0.62, 0.6, 0.58], 'normal');
    warm(0, [0.51, 0.5, 0.49], 'low');
    db.optIns = [];
    expect(((await coachBoard(anyDb(), 'c1', now)).body as { alerts: unknown[] }).alerts).toEqual([]);
  });

  it('the history window matches the VBT server\'s', () => {
    expect(BAR_HISTORY_DAYS).toBe(HISTORY_DAYS);
  });
});
