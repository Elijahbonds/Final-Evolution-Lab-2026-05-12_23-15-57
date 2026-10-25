// COACH-PARITY (2026-10-26): check-in forms end to end over the in-memory tables — the coach builds and assigns, the
// athlete answers under the gates the app already has, and the coach reads the answers over time.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// a teen with a guardian's accepted consent stands for the world AFTER the coach-training wording goes live
const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));

import { coachAct, coachBoard, myForms, submit } from '@/lib/coach/checkins/server';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, fakeParityDb, grant, seedPerson, type FakeParityDb } from '@/tests/helpers/fakeParityDb';

const ON = { COACH_PARITY_HEALTH_ENABLED: 'true' };
const OFF = {};
let db: FakeParityDb;
let now: Date;
const anyDb = () => db as never;

beforeEach(() => {
  resetParityProbe(); resetGroupsProbe();
  cc.since = new Date('2026-01-01');
  db = fakeParityDb();
  now = new Date(db.clock);
  seedPerson(db, 'ada', 'adult', 'Ada'); seedPerson(db, 'ben', 'adult', 'Ben'); seedPerson(db, 'tia', 'teen', 'Tia'); seedPerson(db, 'kim', 'teen-no-consent', 'Kim');
  coach(db, 'c1', 'ada', 'ben', 'tia', 'kim');
  coach(db, 'c2', 'ada');
  db.groups.push({ id: 't1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ben', role: 'member' }, { userId: 'tia', role: 'member' }, { userId: 'stranger', role: 'member' }] });
});

const FORM = { title: 'Weekly check-in', cadence: 'weekly', painCheck: true, questions: [
  { kind: 'scale', prompt: 'How hard was training?' },
  { kind: 'text', prompt: 'Anything for me?' },
  { kind: 'number', prompt: 'Hours slept on average', unit: 'h' },
] };
async function makeForm(env: Record<string, string> = ON, body: Record<string, unknown> = FORM) {
  const r = await coachAct(anyDb(), 'c1', { action: 'create', ...body }, now, env);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return String(r.body.id);
}

describe('before the pending SQL is applied', () => {
  it('reads say not available and writes 503; nothing 500s', async () => {
    db.tables = false;
    expect((await coachBoard(anyDb(), 'c1', {}, now)).body).toEqual({ available: false });
    expect((await myForms(anyDb(), 'ada', now)).body).toEqual({ available: false });
    expect((await coachAct(anyDb(), 'c1', { action: 'create', ...FORM }, now, ON)).status).toBe(503);
    expect((await submit(anyDb(), 'ada', { formId: 'x', answers: {} }, now)).status).toBe(503);
  });
});

describe('the coach', () => {
  it('builds a form; a health question is refused while the health switch is off', async () => {
    expect((await coachAct(anyDb(), 'c1', { action: 'create', ...FORM }, now, OFF)).body).toEqual({ error: 'health_off', at: 2 });
    const id = await makeForm();
    expect(db.forms[0]).toMatchObject({ id, coachId: 'c1', title: 'Weekly check-in', painCheck: true });
    expect(db.forms[0].questions.map((q: { topic: string }) => q.topic)).toEqual(['training', 'training', 'health']);
  });

  it('assigns to an athlete on the roster and a team they run; never to someone else\'s', async () => {
    const id = await makeForm();
    expect((await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'ada' }, now)).body).toEqual({ ok: true, already: false });
    expect((await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'ada' }, now)).body).toEqual({ ok: true, already: true });
    expect((await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'team', scopeId: 't1' }, now)).status).toBe(200);
    expect((await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'stranger' }, now)).body).toEqual({ error: 'not_your_athlete' });
    expect((await coachAct(anyDb(), 'c2', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'ada' }, now)).status).toBe(404);   // c2 does not own it
    const board = (await coachBoard(anyDb(), 'c1', {}, now, ON)).body as { forms: { reach: number; assigned: { name: string }[] }[] };
    // Ada + the team's roster members (Ben, Tia; not the stranger)
    expect(board.forms[0].reach).toBe(3);
    expect(board.forms[0].assigned.map((a) => a.name)).toEqual(['Ada', 'Varsity']);
  });
});

describe('the athlete', () => {
  let id = '';
  beforeEach(async () => {
    id = await makeForm();
    await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'ada' }, now);
    await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'team', scopeId: 't1' }, now);
  });

  it('an adult without the health_data grant sees training + text, the health section locked, and the pain check', async () => {
    const r = (await myForms(anyDb(), 'ada', now, ON)).body as { forms: Record<string, any>[] };
    const f = r.forms[0];
    expect(f.due).toBe(true);
    expect(f.questions.map((q: { prompt: string }) => q.prompt)).toEqual(['How hard was training?', 'Anything for me?']);
    expect(f.health).toMatchObject({ allowed: false, questions: [{ prompt: 'Hours slept on average' }] });
    expect(f.health.consentLine).toMatch(/say yes to FEL keeping your health data/);
    expect(f.painCheck).toBe(true);
  });

  it('a teen sees training questions only: no free text, no health, no pain check; and is told some were left out', async () => {
    const r = (await myForms(anyDb(), 'tia', now, ON)).body as { band: string; forms: Record<string, any>[] };
    expect(r.band).toBe('teen');
    expect(r.forms[0].questions.map((q: { kind: string }) => q.kind)).toEqual(['scale']);
    expect(r.forms[0].health).toBeNull();
    expect(r.forms[0].painCheck).toBe(false);
    expect(r.forms[0].lines.skipped).toMatch(/adults only/);
  });

  it('a teen whose guardian has not consented gets nothing and cannot save (the teen gate\'s own refusal)', async () => {
    await coachAct(anyDb(), 'c1', { action: 'assign', formId: id, scope: 'athlete', scopeId: 'kim' }, now);
    const r = (await myForms(anyDb(), 'kim', now, ON)).body as { forms: unknown[]; blocked: { error: string } };
    expect(r.forms).toEqual([]);
    expect(r.blocked.error).toBe('guardian_consent_required');
    const q1 = db.forms[0].questions[0].id;
    expect((await submit(anyDb(), 'kim', { formId: id, answers: { [q1]: 5 } }, now, ON)).status).toBe(403);
    expect(db.answers).toEqual([]);
  });

  it('today, before the coach-training wording is live, every teen fails closed', async () => {
    cc.since = null;
    expect(((await myForms(anyDb(), 'tia', now, ON)).body as { blocked: { error: string } }).blocked.error).toBe('guardian_consent_required');
  });

  it('a teen\'s training answer saves; a health or text answer from a teen is never stored', async () => {
    const [q1, q2, q3] = db.forms[0].questions.map((q: { id: string }) => q.id);
    expect((await submit(anyDb(), 'tia', { formId: id, answers: { [q1]: 7, [q2]: 'my knee' } }, now, ON)).body).toEqual({ ok: true, period: '2026-10-26' });
    expect(db.answers[0]).toMatchObject({ athleteId: 'tia', answers: { [q1]: 7 }, health: null });
    expect(JSON.stringify(db.answers)).not.toContain('knee');
    expect((await submit(anyDb(), 'tia', { formId: id, answers: { [q1]: 7 }, health: { [q3]: 8 } }, now, ON)).body).toEqual({ error: 'health_data_adults_only', saved: false });
  });

  it('an adult\'s health answer needs the health_data grant (412), then saves beside the training answers', async () => {
    const [q1, , q3] = db.forms[0].questions.map((q: { id: string }) => q.id);
    expect((await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 6 }, health: { [q3]: 7.5 } }, now, ON)).body).toEqual({ error: 'health_data_consent_required', saved: false });
    expect(db.answers).toEqual([]);
    grant(db, 'ada', 'health_data');
    expect((await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 6 }, health: { [q3]: 7.5 } }, now, ON)).status).toBe(200);
    expect(db.answers[0]).toMatchObject({ answers: { [q1]: 6 }, health: { [q3]: 7.5 }, period: '2026-10-26' });
    // a re-send this week with training only keeps the health answers
    expect((await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 8 } }, now, ON)).status).toBe(200);
    expect(db.answers).toHaveLength(1);
    expect(db.answers[0]).toMatchObject({ answers: { [q1]: 8 }, health: { [q3]: 7.5 } });
    // with the switch off, a health answer is not taken
    expect((await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 8 }, health: { [q3]: 7 } }, now, OFF)).body).toEqual({ error: 'health_off' });
  });

  it('a form the athlete was not assigned, or from a coach who no longer coaches them, is not theirs', async () => {
    expect((await submit(anyDb(), 'ada', { formId: 'nope', answers: {} }, now, ON)).status).toBe(404);
    db.links = db.links.filter((l) => !(l.coachId === 'c1' && l.clientId === 'ada'));
    expect(((await myForms(anyDb(), 'ada', now, ON)).body as { forms: unknown[] }).forms).toEqual([]);
  });

  it('bad answers are refused and nothing is written', async () => {
    const q1 = db.forms[0].questions[0].id;
    expect((await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 42 } }, now, ON)).body).toEqual({ error: 'bad_answer', id: q1 });
    expect((await submit(anyDb(), 'ada', { formId: id, answers: {} }, now, ON)).body).toEqual({ error: 'no_answers' });
    expect(db.answers).toEqual([]);
  });

  it('the coach reads answers over time; health columns only from an adult who shares with THIS coach', async () => {
    const [q1, , q3] = db.forms[0].questions.map((q: { id: string }) => q.id);
    grant(db, 'ada', 'health_data');
    const lastWeek = new Date(now.getTime() - 7 * 86_400_000);
    await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 5 }, health: { [q3]: 6 } }, lastWeek, ON);
    await submit(anyDb(), 'ada', { formId: id, answers: { [q1]: 8 }, health: { [q3]: 7.5 } }, now, ON);
    let d = (await coachBoard(anyDb(), 'c1', { formId: id }, now, ON)).body.detail as { athletes: Record<string, any>[] };
    let ada = d.athletes.find((a) => a.id === 'ada')!;
    expect(ada.healthShared).toBe(false);
    expect(ada.columns.map((c: { id: string }) => c.id)).toEqual([q1, db.forms[0].questions[1].id]);
    expect(ada.rows.map((r: { period: string; cells: Record<string, string> }) => [r.period, r.cells[q1]])).toEqual([['2026-10-26', '8/10'], ['2026-10-19', '5/10']]);
    expect(JSON.stringify(d)).not.toContain('7.5');
    expect(ada.series[q1]).toEqual([{ period: '2026-10-19', value: 5 }, { period: '2026-10-26', value: 8 }]);
    grant(db, 'ada', 'coach_view', 'c2');   // sharing with ANOTHER coach changes nothing here
    d = (await coachBoard(anyDb(), 'c1', { formId: id }, now, ON)).body.detail as { athletes: Record<string, any>[] };
    expect(JSON.stringify(d)).not.toContain('7.5');
    grant(db, 'ada', 'coach_view', 'c1');
    d = (await coachBoard(anyDb(), 'c1', { formId: id }, now, ON)).body.detail as { athletes: Record<string, any>[] };
    ada = d.athletes.find((a) => a.id === 'ada')!;
    expect(ada.healthShared).toBe(true);
    expect(ada.rows[0].cells[q3]).toBe('7.5 h');
  });

  it('archive: the form leaves the athletes\' lists', async () => {
    expect((await coachAct(anyDb(), 'c1', { action: 'archive', id }, now)).status).toBe(200);
    expect(((await myForms(anyDb(), 'ada', now, ON)).body as { forms: unknown[] }).forms).toEqual([]);
  });
});
