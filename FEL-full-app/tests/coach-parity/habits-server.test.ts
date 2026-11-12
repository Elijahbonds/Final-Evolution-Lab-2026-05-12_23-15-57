// COACH-PARITY (2026-10-26): coach-assigned habits end to end over the in-memory tables — the coach assigns, the athlete
// ticks from Today under the gates, and the coach reads compliance and streaks.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));

import { coachHabitAct, coachHabitBoard, myHabits, tickHabit } from '@/lib/coach/habits/server';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, fakeParityDb, grant, seedPerson, type FakeParityDb } from '@/tests/helpers/fakeParityDb';

const ON = { COACH_PARITY_HEALTH_ENABLED: 'true' };
let db: FakeParityDb;
let now: Date;
const anyDb = () => db as never;
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000);

beforeEach(() => {
  resetParityProbe(); resetGroupsProbe();
  cc.since = new Date('2026-01-01');
  db = fakeParityDb();
  now = new Date(db.clock);
  seedPerson(db, 'ada', 'adult', 'Ada'); seedPerson(db, 'tia', 'teen', 'Tia'); seedPerson(db, 'bo', 'blank', 'Bo');
  coach(db, 'c1', 'ada', 'tia', 'bo');
  db.groups.push({ id: 't1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ada', role: 'member' }, { userId: 'tia', role: 'member' }] });
});

async function create(body: Record<string, unknown>, env: Record<string, string> = ON) {
  return coachHabitAct(anyDb(), 'c1', { action: 'create', ...body }, now, env);
}

describe('before the pending SQL is applied', () => {
  it('not available / 503', async () => {
    db.tables = false;
    expect((await coachHabitBoard(anyDb(), 'c1', now)).body).toEqual({ available: false });
    expect((await myHabits(anyDb(), 'ada', now)).body).toEqual({ available: false });
    expect((await create({ preset: 'steps', scope: 'athlete', scopeId: 'ada' })).status).toBe(503);
    expect((await tickHabit(anyDb(), 'ada', { habitId: 'h', done: true }, now)).status).toBe(503);
  });
});

describe('the coach assigns', () => {
  it('a training habit to an athlete or a team', async () => {
    expect((await create({ preset: 'steps', scope: 'athlete', scopeId: 'ada' })).status).toBe(201);
    expect((await create({ preset: 'practice', scope: 'team', scopeId: 't1', frequency: 'weekly', perWeek: 3 })).status).toBe(201);
    expect(db.habits.map((h) => [h.preset, h.scope, h.topic])).toEqual([['steps', 'athlete', 'training'], ['practice', 'team', 'training']]);
  });
  it('never a health or body/diet habit to a minor or a blank birth year; never to someone off the roster', async () => {
    expect((await create({ preset: 'sleep', scope: 'athlete', scopeId: 'tia' })).body).toEqual({ error: 'habit_adults_only' });
    expect((await create({ preset: 'weigh_in', scope: 'athlete', scopeId: 'bo' })).body).toEqual({ error: 'habit_adults_only' });
    expect((await create({ preset: 'steps', scope: 'athlete', scopeId: 'stranger' })).body).toEqual({ error: 'not_your_athlete' });
    expect((await create({ preset: 'steps', scope: 'team', scopeId: 'nope' })).body).toEqual({ error: 'not_your_team' });
    expect((await create({ preset: 'sleep', scope: 'athlete', scopeId: 'ada' }, {})).body).toEqual({ error: 'health_off' });
    expect(db.habits).toEqual([]);
  });
});

describe('the athlete ticks from Today', () => {
  beforeEach(async () => {
    await create({ preset: 'steps', scope: 'team', scopeId: 't1' });
    await create({ preset: 'sleep', scope: 'team', scopeId: 't1' });   // a team's health habit: adults only
  });
  const ids = () => ({ steps: db.habits.find((h) => h.preset === 'steps')!.id, sleep: db.habits.find((h) => h.preset === 'sleep')!.id });

  it('a teen sees the training habit only; an adult sees both, the health one locked without the grant', async () => {
    const teen = (await myHabits(anyDb(), 'tia', now, ON)).body as { habits: { preset: string }[] };
    expect(teen.habits.map((h) => h.preset)).toEqual(['steps']);
    const adult = (await myHabits(anyDb(), 'ada', now, ON)).body as { habits: { preset: string; locked: string | null; healthLine: string | null }[] };
    expect(adult.habits.map((h) => [h.preset, !!h.locked, !!h.healthLine])).toEqual([['steps', false, false], ['sleep', true, true]]);
  });

  it('ticks, streaks and untick; the play streak and Lab Credits are never touched (no such statement exists)', async () => {
    const { steps } = ids();
    for (const d of [3, 2, 1]) expect((await tickHabit(anyDb(), 'ada', { habitId: steps, done: true, value: 11_000 }, at(d), ON)).status).toBe(200);
    expect((await tickHabit(anyDb(), 'ada', { habitId: steps, done: true, value: 6_000 }, now, ON)).body).toMatchObject({ ok: true, done: false });
    let h = ((await myHabits(anyDb(), 'ada', now, ON)).body as { habits: Record<string, any>[] }).habits[0];
    expect(h).toMatchObject({ today: { ticked: true, value: 6000, done: false }, streak: 3, streakUnit: 'day' });
    await tickHabit(anyDb(), 'ada', { habitId: steps, done: true, value: 10_400 }, now, ON);
    h = ((await myHabits(anyDb(), 'ada', now, ON)).body as { habits: Record<string, any>[] }).habits[0];
    expect(h).toMatchObject({ today: { done: true }, streak: 4 });
    expect((await tickHabit(anyDb(), 'ada', { habitId: steps, done: false }, now, ON)).body).toMatchObject({ ok: true, done: false });
    expect(db.ticks.filter((t) => t.day === '2026-10-28')).toEqual([]);
    expect(db.log.some((q) => /PlayerProfile|Wallet|Ledger/i.test(q))).toBe(false);
    expect((await tickHabit(anyDb(), 'ada', { habitId: steps, done: true, value: 'lots' }, now, ON)).body).toEqual({ error: 'bad_value' });
  });

  it('health habit: a teen is refused (403), an adult needs the health_data grant (412), then it saves', async () => {
    const { sleep } = ids();
    expect((await tickHabit(anyDb(), 'tia', { habitId: sleep, done: true, value: 8 }, now, ON)).body).toEqual({ error: 'health_data_adults_only', saved: false });
    expect((await tickHabit(anyDb(), 'ada', { habitId: sleep, done: true, value: 8 }, now, ON)).body).toEqual({ error: 'health_data_consent_required', saved: false });
    expect(db.ticks).toEqual([]);
    grant(db, 'ada', 'health_data');
    expect((await tickHabit(anyDb(), 'ada', { habitId: sleep, done: true, value: 8 }, now, ON)).body).toMatchObject({ ok: true, done: true });
  });

  it('a teen without guardian consent cannot tick at all', async () => {
    cc.since = null;
    const { steps } = ids();
    expect((await tickHabit(anyDb(), 'tia', { habitId: steps, done: true, value: 12_000 }, now, ON)).status).toBe(403);
    expect(db.ticks).toEqual([]);
  });

  it('the coach sees compliance and streaks; a health habit\'s ticks only from an adult who shares with them', async () => {
    const { steps, sleep } = ids();
    for (const h of db.habits) h.createdAt = at(10);   // assigned ten days ago
    grant(db, 'ada', 'health_data');
    for (const d of [0, 1, 2, 4]) await tickHabit(anyDb(), 'ada', { habitId: steps, done: true, value: 12_000 }, at(d), ON);
    await tickHabit(anyDb(), 'tia', { habitId: steps, done: true, value: 10_000 }, now, ON);
    await tickHabit(anyDb(), 'ada', { habitId: sleep, done: true, value: 8 }, now, ON);
    let board = (await coachHabitBoard(anyDb(), 'c1', now, ON)).body as { habits: Record<string, any>[] };
    const s = board.habits.find((h) => h.id === steps)!;
    expect(s.athletes.map((a: Record<string, unknown>) => [a.name, a.streak, (a.compliance as { done: number }).done])).toEqual([['Ada', 3, 4], ['Tia', 1, 1]]);
    let sl = board.habits.find((h) => h.id === sleep)!;
    // a team's health habit reaches the adult only, and without a coach_view grant the coach sees no tick of it
    expect(sl.athletes).toEqual([{ id: 'ada', name: 'Ada', shared: false }]);
    grant(db, 'ada', 'coach_view', 'c1');
    board = (await coachHabitBoard(anyDb(), 'c1', now, ON)).body as { habits: Record<string, any>[] };
    sl = board.habits.find((h) => h.id === sleep)!;
    expect(sl.athletes[0]).toMatchObject({ shared: true, streak: 1, today: true });
  });

  it('archive removes it from Today', async () => {
    const { steps } = ids();
    expect((await coachHabitAct(anyDb(), 'c1', { action: 'archive', id: steps }, now)).status).toBe(200);
    expect(((await myHabits(anyDb(), 'tia', now, ON)).body as { habits: unknown[] }).habits).toEqual([]);
    expect((await coachHabitAct(anyDb(), 'c2', { action: 'archive', id: steps }, now)).status).toBe(404);
  });
});
