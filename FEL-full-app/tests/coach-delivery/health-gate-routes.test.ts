// COACH-DELIVERY (2026-10-27): HEALTH_WRITE_ROUTES g and h. The verified-adult check for a coach-parity health write now
// runs in the route file (passed into submit / tickHabit as healthGate). These hold that the passed check is the one
// used, that it decides a health answer exactly as the built-in one did, and that it is asked only for an adult band.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));

import { coachHabitAct, tickHabit } from '@/lib/coach/habits/server';
import { coachAct, submit } from '@/lib/coach/checkins/server';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, fakeParityDb, grant, seedPerson, type FakeParityDb } from '@/tests/helpers/fakeParityDb';

const ON = { COACH_PARITY_HEALTH_ENABLED: 'true' };
let db: FakeParityDb;
let now: Date;
const anyDb = () => db as never;

beforeEach(() => {
  resetParityProbe(); resetGroupsProbe();
  db = fakeParityDb();
  now = new Date(db.clock);
  seedPerson(db, 'ada', 'adult', 'Ada'); seedPerson(db, 'tia', 'teen', 'Tia');
  coach(db, 'c1', 'ada', 'tia');
  grant(db, 'ada', 'health_data');
});

describe('h: a health habit tick', () => {
  it('uses the route\'s check: false refuses an adult (403, nothing saved), true saves; a teen never reaches it', async () => {
    await coachHabitAct(anyDb(), 'c1', { action: 'create', preset: 'sleep', scope: 'athlete', scopeId: 'ada' }, now, ON);
    const id = db.habits[0].id;
    const no = vi.fn(async () => false);
    expect((await tickHabit(anyDb(), 'ada', { habitId: id, done: true, value: 8 }, now, ON, no)).body).toEqual({ error: 'health_data_adults_only', saved: false });
    expect(no).toHaveBeenCalledTimes(1);
    expect(db.ticks).toEqual([]);
    const yes = vi.fn(async () => true);
    expect((await tickHabit(anyDb(), 'ada', { habitId: id, done: true, value: 8 }, now, ON, yes)).body).toMatchObject({ ok: true });
    await coachHabitAct(anyDb(), 'c1', { action: 'create', preset: 'steps', scope: 'athlete', scopeId: 'tia' }, now, ON);
    const teenGate = vi.fn(async () => true);
    await tickHabit(anyDb(), 'tia', { habitId: db.habits[1].id, done: true, value: 10_000 }, now, ON, teenGate);
    expect(teenGate).not.toHaveBeenCalled();
  });
});

describe('g: a check-in\'s health answers', () => {
  it('uses the route\'s check for the health section; training answers are unaffected by it', async () => {
    const made = await coachAct(anyDb(), 'c1', {
      action: 'create', title: 'Weekly', cadence: 'weekly',
      questions: [{ id: 'q1', kind: 'scale', prompt: 'Session quality', topic: 'training' }, { id: 'q2', kind: 'scale', prompt: 'Sleep quality', topic: 'health' }],
    }, now, ON);
    expect(made.status).toBe(201);
    expect((await coachAct(anyDb(), 'c1', { action: 'assign', formId: db.forms[0].id, scope: 'athlete', scopeId: 'ada' }, now, ON)).status).toBe(200);
    const formId = db.forms[0].id;
    const no = vi.fn(async () => false);
    expect((await submit(anyDb(), 'ada', { formId, answers: { q1: 7 }, health: { q2: 6 } }, now, ON, no)).body).toEqual({ error: 'health_data_adults_only', saved: false });
    expect((await submit(anyDb(), 'ada', { formId, answers: { q1: 7 } }, now, ON, no)).status).toBe(200);
    expect((await submit(anyDb(), 'ada', { formId, answers: { q1: 7 }, health: { q2: 6 } }, now, ON, async () => true)).status).toBe(200);
  });
});
